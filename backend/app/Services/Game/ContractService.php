<?php

namespace App\Services\Game;

use App\Exceptions\GameRuleException;
use App\Models\GameClub;
use App\Models\GamePlayer;
use App\Models\GamePlayerContract;
use App\Models\GameSave;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ContractService
{
    /**
     * Put a player under contract at a club until the end of the season, $years seasons on.
     * A running contract elsewhere ends as "transferred"; at the same club it is replaced (a renewal).
     *
     * @throws GameRuleException invalid_contract / wage_budget_exceeded
     */
    public function sign(GamePlayer $player, GameClub $club, int $wage, int $years, int $signingBonus = 0, ?int $releaseClause = null): GamePlayerContract
    {
        $limits = config('game.contract_years');
        if ($years < $limits['min'] || $years > $limits['max']) {
            throw new GameRuleException('invalid_contract', "A contract runs for {$limits['min']} to {$limits['max']} seasons.");
        }
        if ($wage < 1) {
            throw new GameRuleException('invalid_contract', 'A contract needs a wage.');
        }

        return DB::transaction(function () use ($player, $club, $wage, $years, $signingBonus, $releaseClause) {
            $today = Carbon::parse(GameSave::whereKey($club->game_save_id)->value('game_date'));
            $current = GamePlayerContract::where('game_player_id', $player->id)->where('status', GamePlayerContract::ACTIVE)->lockForUpdate()->first();
            $freedWage = $current && $current->game_club_id === $club->id ? $current->wage : 0;
            if ($club->wageBill() - $freedWage + $wage > $club->wage_budget) {
                throw new GameRuleException('wage_budget_exceeded', "{$club->name} cannot fit a wage of $wage into its wage budget.");
            }
            $current?->update([
                'status' => $current->game_club_id === $club->id ? GamePlayerContract::TERMINATED : GamePlayerContract::TRANSFERRED,
                'ended_on' => $today,
            ]);

            return GamePlayerContract::create([
                'game_save_id' => $club->game_save_id, 'game_player_id' => $player->id, 'game_club_id' => $club->id,
                'wage' => $wage, 'signing_bonus' => $signingBonus, 'release_clause' => $releaseClause,
                'starts_on' => $today, 'ends_on' => GameSave::seasonEnd($today)->addYears($years - 1), 'status' => GamePlayerContract::ACTIVE,
            ]);
        });
    }

    /** End a contract early; the player becomes a free agent. */
    public function release(GamePlayer $player): void
    {
        DB::transaction(function () use ($player) {
            $locked = GamePlayer::whereKey($player->id)->lockForUpdate()->firstOrFail();
            $today = GameSave::whereKey($locked->game_save_id)->value('game_date');
            GamePlayerContract::where('game_player_id', $locked->id)->where('status', GamePlayerContract::ACTIVE)
                ->update(['status' => GamePlayerContract::TERMINATED, 'ended_on' => $today]);
            $locked->update(['game_club_id' => null, 'squad_number' => null]);
            $player->setRawAttributes($locked->getAttributes(), true);
        });
    }

    /**
     * End every contract that ran out before the save's date and free those players.
     *
     * @return list<int> ids of the game players who became free agents
     */
    public function expireContracts(GameSave $save): array
    {
        return DB::transaction(function () use ($save) {
            $expired = GamePlayerContract::where('game_save_id', $save->id)->where('status', GamePlayerContract::ACTIVE)
                ->whereDate('ends_on', '<', $save->game_date)->lockForUpdate()->get();
            if ($expired->isEmpty()) {
                return [];
            }
            GamePlayerContract::whereKey($expired->modelKeys())->update(['status' => GamePlayerContract::EXPIRED, 'ended_on' => DB::raw('ends_on')]);
            $playerIds = $expired->pluck('game_player_id')->all();
            GamePlayer::whereKey($playerIds)->update(['game_club_id' => null, 'squad_number' => null]);

            return $playerIds;
        });
    }
}
