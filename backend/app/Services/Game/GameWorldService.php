<?php

namespace App\Services\Game;

use App\Exceptions\GameRuleException;
use App\Models\Club;
use App\Models\GameClub;
use App\Models\GameSave;
use App\Models\User;
use App\Services\Transfers\TransferMarketService;
use App\Services\Transfers\TransferService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Creates game saves from the catalogue and moves a save's calendar forward. */
class GameWorldService
{
    public function __construct(
        private readonly ContractService $contracts,
        private readonly TransferMarketService $market,
        private readonly TransferService $transfers,
    ) {}

    /**
     * Start a new save: every catalogue club and player gets its own copy of the state that
     * play changes (money, attributes, contracts), so saves never affect each other.
     *
     * @throws GameRuleException duplicate_save_name
     */
    public function createSave(User $user, string $name, Club $club, ?int $seed = null): GameSave
    {
        $season = (int) config('game.first_season');
        $start = Carbon::parse($season.'-'.config('game.season_start'));

        try {
            return DB::transaction(function () use ($user, $name, $club, $seed, $season, $start) {
                $save = GameSave::create([
                    'user_id' => $user->id, 'name' => $name, 'season' => $season, 'game_date' => $start,
                    'seed' => $seed ?? random_int(1, 2_000_000_000),
                ]);
                $this->copyWorld($save, $club, $start);
                $save->update(['user_game_club_id' => GameClub::where(['game_save_id' => $save->id, 'club_id' => $club->id])->value('id')]);
                $this->market->openWindows($save);

                return $save->fresh();
            });
        } catch (UniqueConstraintViolationException $e) {
            if (str_contains($e->getMessage(), 'game_saves_user_id_name_unique')) {
                throw new GameRuleException('duplicate_save_name', "You already have a save called \"$name\".", 409);
            }
            throw $e;
        }
    }

    /**
     * Move the save's calendar forward. Contracts that ran out end, loans that ran out return,
     * and transfer windows open and close for the new date.
     *
     * @throws GameRuleException date_in_past
     */
    public function advanceTo(GameSave $save, Carbon|string $date): GameSave
    {
        $date = Carbon::parse($date)->startOfDay();

        return DB::transaction(function () use ($save, $date) {
            $locked = GameSave::whereKey($save->id)->lockForUpdate()->firstOrFail();
            if ($date->lt($locked->game_date)) {
                throw new GameRuleException('date_in_past', 'A save cannot go back in time.');
            }
            $locked->update(['game_date' => $date, 'season' => GameSave::seasonOf($date)]);

            $this->market->returnFinishedLoans($locked);
            $freed = $this->contracts->expireContracts($locked);
            $this->market->clearMarketFor($locked, $freed, 'The contract ran out.');
            $this->market->openWindows($locked);
            $this->transfers->inviteBidsForOpenListings($locked);
            $save->setRawAttributes($locked->getAttributes(), true);

            return $save;
        });
    }

    /** Set-based copy of the catalogue into the save: fast for thousands of players. */
    private function copyWorld(GameSave $save, Club $userClub, Carbon $start): void
    {
        $money = config('game.club_balance');
        $budget = config('game.wage_budget');
        $now = now();

        DB::insert('
            INSERT INTO game_clubs (game_save_id, club_id, name, reputation, balance, transfer_budget, wage_budget, is_user_controlled, created_at, updated_at)
            SELECT ?, id, name, reputation, ?::int + reputation * ?::int, floor((?::int + reputation * ?::int) * ?::numeric), 0, id = ?, ?, ?
            FROM clubs ORDER BY id',
            [$save->id, $money['base'], $money['per_reputation'], $money['base'], $money['per_reputation'], config('game.transfer_budget_share'), $userClub->id, $now, $now]);

        DB::insert('
            INSERT INTO game_players (game_save_id, player_id, game_club_id, created_at, updated_at)
            SELECT ?, p.id, gc.id, ?, ?
            FROM players p LEFT JOIN game_clubs gc ON gc.club_id = p.club_id AND gc.game_save_id = ?
            ORDER BY p.id',
            [$save->id, $now, $now, $save->id]);

        DB::insert("
            INSERT INTO game_player_attributes (game_player_id, speed, shooting, passing, dribbling, defending, stamina, overall, potential, market_value, wage_expectation, created_at, updated_at)
            SELECT gp.id, (p.base_attributes->>'speed')::int, (p.base_attributes->>'shooting')::int, (p.base_attributes->>'passing')::int,
                   (p.base_attributes->>'dribbling')::int, (p.base_attributes->>'defending')::int, (p.base_attributes->>'stamina')::int,
                   p.base_overall, p.base_potential, p.base_market_value, p.base_wage, ?, ?
            FROM game_players gp JOIN players p ON p.id = gp.player_id
            WHERE gp.game_save_id = ?",
            [$now, $now, $save->id]);

        // first contracts run one to four seasons, spread by player id so they do not all end together
        DB::insert("
            INSERT INTO game_player_contracts (game_save_id, game_player_id, game_club_id, wage, starts_on, ends_on, status, created_at, updated_at)
            SELECT gp.game_save_id, gp.id, gp.game_club_id, p.base_wage, ?::date,
                   (?::date + make_interval(years => 1 + (p.id % 4)::int) - interval '1 day')::date, 'active', ?, ?
            FROM game_players gp JOIN players p ON p.id = gp.player_id
            WHERE gp.game_save_id = ? AND gp.game_club_id IS NOT NULL",
            [$start->toDateString(), $start->toDateString(), $now, $now, $save->id]);

        DB::update("
            UPDATE game_clubs gc SET wage_budget = ceil(coalesce(w.bill, 0) * ?::numeric) + ?::int
            FROM (SELECT gc2.id, (SELECT sum(wage) FROM game_player_contracts c WHERE c.game_club_id = gc2.id AND c.status = 'active') AS bill
                  FROM game_clubs gc2 WHERE gc2.game_save_id = ?) w
            WHERE gc.id = w.id",
            [$budget['headroom'], $budget['extra'], $save->id]);

        DB::insert("
            INSERT INTO game_finance_transactions (game_save_id, game_club_id, type, amount, balance_after, description, game_date, created_at, updated_at)
            SELECT game_save_id, id, 'initial', balance, balance, 'Opening balance', ?, ?, ?
            FROM game_clubs WHERE game_save_id = ?",
            [$start->toDateString(), $now, $now, $save->id]);
    }
}
