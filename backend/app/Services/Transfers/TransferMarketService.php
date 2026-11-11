<?php

namespace App\Services\Transfers;

use App\Models\GameLoanAgreement;
use App\Models\GamePlayer;
use App\Models\GameSave;
use App\Models\GameTransfer;
use App\Models\GameTransferListing;
use App\Models\GameTransferOffer;
use App\Models\GameTransferWindow;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** The market's surroundings: windows, player search, and tidying up when the calendar moves. */
class TransferMarketService
{
    private const SORTS = [
        'overall' => 'a.overall', 'potential' => 'a.potential', 'price' => 'price', 'value' => 'a.market_value',
        'age' => 'p.birth_date', 'name' => 'p.name',
    ];

    /** Make sure the running season's windows exist and mark each as upcoming, open or closed. */
    public function openWindows(GameSave $save): void
    {
        $date = $save->game_date->toDateString();
        foreach (config('game.transfer_windows') as $name => [$opens, $closes]) {
            // month-days before the season start belong to the second calendar year of the season
            $year = fn (string $md) => $md >= config('game.season_start') ? $save->season : $save->season + 1;
            GameTransferWindow::firstOrCreate(
                ['game_save_id' => $save->id, 'season' => $save->season, 'name' => $name],
                ['opens_on' => $year($opens)."-$opens", 'closes_on' => $year($closes)."-$closes"],
            );
        }
        GameTransferWindow::where('game_save_id', $save->id)->update(['status' => DB::raw(
            "CASE WHEN opens_on > '$date' THEN 'upcoming' WHEN closes_on < '$date' THEN 'closed' ELSE 'open' END"
        )]);
    }

    /** The window that is open on the save's date, if any. */
    public function currentWindow(GameSave $save): ?GameTransferWindow
    {
        return GameTransferWindow::where('game_save_id', $save->id)
            ->whereDate('opens_on', '<=', $save->game_date)->whereDate('closes_on', '>=', $save->game_date)->first();
    }

    /**
     * Players of a save, filtered and sorted. Filters: search, position, origin, nationality,
     * min_age/max_age, min_rating/max_rating, min_potential/max_potential, min_price/max_price,
     * club_id, availability (listed | free_agents), sort, direction.
     * "price" is the asking price of a listed player and the market value of anyone else.
     *
     * @param  array<string, mixed>  $filters
     * @param  int|null  $excludeClubId  leave out this club's own players (the transfer market view)
     */
    public function players(GameSave $save, array $filters = [], ?int $excludeClubId = null): Builder
    {
        $price = 'coalesce(l.asking_price, a.market_value)';
        $between = function (Builder $q, string $column, string $key) use ($filters) {
            $q->when(isset($filters["min_$key"]), fn (Builder $w) => $w->whereRaw("$column >= ?", [(int) $filters["min_$key"]]))
                ->when(isset($filters["max_$key"]), fn (Builder $w) => $w->whereRaw("$column <= ?", [(int) $filters["max_$key"]]));
        };

        $query = GamePlayer::query()
            ->join('players as p', 'p.id', '=', 'game_players.player_id')
            ->join('game_player_attributes as a', 'a.game_player_id', '=', 'game_players.id')
            ->leftJoin('game_transfer_listings as l', fn ($j) => $j->on('l.game_player_id', '=', 'game_players.id')->where('l.status', GameTransferListing::ACTIVE))
            ->where('game_players.game_save_id', $save->id)
            ->where('game_players.status', 'active')
            ->select('game_players.*')->selectRaw("$price as price")
            ->whereHas('player', fn (Builder $q) => $q->filter($filters, $save->game_date))
            ->when($excludeClubId, fn (Builder $q, $id) => $q->where(fn (Builder $w) => $w->whereNull('game_players.game_club_id')->orWhere('game_players.game_club_id', '!=', $id)))
            ->when($filters['club_id'] ?? null, fn (Builder $q, $id) => $q->where('game_players.game_club_id', $id))
            ->when(($filters['availability'] ?? null) === 'listed', fn (Builder $q) => $q->whereNotNull('l.id'))
            ->when(($filters['availability'] ?? null) === 'free_agents', fn (Builder $q) => $q->whereNull('game_players.game_club_id'));

        $between($query, 'a.overall', 'rating');
        $between($query, 'a.potential', 'potential');
        $between($query, $price, 'price');

        $sort = self::SORTS[$filters['sort'] ?? 'overall'] ?? self::SORTS['overall'];
        $direction = ($filters['direction'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        // a later birth date is a younger player, so "age asc" sorts birth dates downwards
        if ($sort === 'p.birth_date') {
            $direction = $direction === 'asc' ? 'desc' : 'asc';
        }

        return $query->orderBy(DB::raw($sort), $direction)->orderBy('game_players.id');
    }

    /**
     * Take players off the market: their listings are withdrawn, open offers for them refused
     * and running loans ended. Used when a player stops belonging to a club.
     *
     * @param  list<int>  $gamePlayerIds
     */
    public function clearMarketFor(GameSave $save, array $gamePlayerIds, string $note): void
    {
        if ($gamePlayerIds === []) {
            return;
        }
        $today = $save->game_date->toDateString();
        GameTransferListing::whereIn('game_player_id', $gamePlayerIds)->where('status', GameTransferListing::ACTIVE)
            ->update(['status' => GameTransferListing::WITHDRAWN, 'closed_on' => $today]);
        GameTransferOffer::whereIn('game_player_id', $gamePlayerIds)->where('status', GameTransferOffer::PENDING)
            ->update(['status' => GameTransferOffer::REJECTED, 'awaiting' => 'none', 'closing_note' => $note, 'closed_on' => $today]);
        GameLoanAgreement::whereIn('game_player_id', $gamePlayerIds)->where('status', GameLoanAgreement::ACTIVE)
            ->update(['status' => GameLoanAgreement::COMPLETED]);
    }

    /**
     * Send players whose loan ran out before the save's date back to their parent club.
     *
     * @return int how many came back
     */
    public function returnFinishedLoans(GameSave $save): int
    {
        $loans = GameLoanAgreement::where('game_save_id', $save->id)->where('status', GameLoanAgreement::ACTIVE)
            ->whereDate('ends_on', '<', $save->game_date)->lockForUpdate()->get();

        foreach ($loans as $loan) {
            GamePlayer::whereKey($loan->game_player_id)->update(['game_club_id' => $loan->parent_club_id, 'squad_number' => null]);
            $loan->update(['status' => GameLoanAgreement::COMPLETED]);
            GameTransfer::create([
                'game_save_id' => $save->id, 'game_player_id' => $loan->game_player_id, 'from_club_id' => $loan->loan_club_id,
                'to_club_id' => $loan->parent_club_id, 'type' => GameTransfer::LOAN_RETURN, 'fee' => 0,
                'season' => GameSave::seasonOf(Carbon::parse($loan->ends_on)), 'game_date' => $loan->ends_on,
            ]);
        }

        return $loans->count();
    }
}
