<?php

namespace Tests\Support;

use App\Models\Club;
use App\Models\GameClub;
use App\Models\GamePlayer;
use App\Models\GameSave;
use App\Models\League;
use App\Models\User;
use App\Services\Game\GameWorldService;
use App\Services\Players\PlayerGenerator;

/** A small catalogue (3 clubs of 12 players and 4 free agents) and saves built from it. */
trait BuildsGameWorld
{
    protected function seedSmallWorld(): void
    {
        $generator = new PlayerGenerator(seed: 99);
        $league = League::create(['name' => 'Test League', 'is_fictional' => true]);
        foreach (['Alpha FC' => 70, 'Beta FC' => 60, 'Gamma FC' => 50] as $name => $reputation) {
            $club = Club::create(['league_id' => $league->id, 'name' => $name, 'is_fictional' => true, 'reputation' => $reputation]);
            foreach (['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST'] as $i => $position) {
                $generator->create(['position' => $position, 'overall' => $reputation - 10 + $i % 5, 'club_id' => $club->id, 'age' => 20 + $i]);
            }
        }
        foreach (['GK', 'CB', 'CM', 'ST'] as $i => $position) {
            $generator->create(['position' => $position, 'overall' => 45 + $i * 3, 'age' => 22 + $i]);
        }
    }

    protected function newSave(?User $user = null, string $name = 'Career', string $club = 'Alpha FC'): GameSave
    {
        return app(GameWorldService::class)->createSave($user ?? User::factory()->create(), $name, Club::where('name', $club)->firstOrFail());
    }

    protected function gameClub(GameSave $save, string $name): GameClub
    {
        return GameClub::where(['game_save_id' => $save->id, 'name' => $name])->firstOrFail();
    }

    /** The club's player at this position (the first one by id). */
    protected function playerOf(GameClub $club, string $position = 'ST'): GamePlayer
    {
        return GamePlayer::where('game_players.game_club_id', $club->id)
            ->whereHas('player', fn ($q) => $q->where('primary_position', $position))
            ->orderBy('id')->firstOrFail();
    }

    protected function freeAgent(GameSave $save, string $position = 'ST'): GamePlayer
    {
        return GamePlayer::where('game_save_id', $save->id)->whereNull('game_club_id')
            ->whereHas('player', fn ($q) => $q->where('primary_position', $position))
            ->orderBy('id')->firstOrFail();
    }

    /** Offer terms the selling club and the player both accept at once. */
    protected function fairTerms(GamePlayer $player, array $overrides = []): array
    {
        return $overrides + [
            'type' => 'transfer',
            'fee' => (int) ceil($player->ratings->market_value * config('game.negotiation.unlisted_premium')),
            'wage' => $player->ratings->wage_expectation,
            'contract_years' => 3,
        ];
    }
}
