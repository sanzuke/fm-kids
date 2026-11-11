<?php

namespace App\Services\Game;

use App\Exceptions\GameRuleException;
use App\Models\GameClub;
use App\Models\GamePlayer;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

class SquadService
{
    /** @return Collection<int, GamePlayer> the club's players, best first */
    public function squad(GameClub $club): Collection
    {
        return GamePlayer::with(['player.country', 'ratings', 'activeContract'])
            ->where('game_players.game_club_id', $club->id)
            ->join('game_player_attributes as a', 'a.game_player_id', '=', 'game_players.id')
            ->orderByDesc('a.overall')->orderBy('game_players.id')
            ->select('game_players.*')->get();
    }

    public function size(GameClub $club): int
    {
        return GamePlayer::where('game_club_id', $club->id)->count();
    }

    /**
     * Give a player a shirt number (1-99) nobody else at the club wears, or take it away with null.
     *
     * @throws GameRuleException not_your_player / number_taken
     */
    public function assignNumber(GameClub $club, GamePlayer $player, ?int $number): void
    {
        if ($player->game_club_id !== $club->id) {
            throw new GameRuleException('not_your_player', 'That player is not in this squad.', 403);
        }
        if ($number !== null && ($number < 1 || $number > 99)) {
            throw new GameRuleException('invalid_number', 'Shirt numbers run from 1 to 99.');
        }
        try {
            DB::transaction(fn () => $player->update(['squad_number' => $number]));
        } catch (UniqueConstraintViolationException) {
            throw new GameRuleException('number_taken', "Number $number is already worn at {$club->name}.", 409);
        }
    }
}
