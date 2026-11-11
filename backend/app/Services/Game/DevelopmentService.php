<?php

namespace App\Services\Game;

use App\Models\GamePlayer;
use App\Models\GamePlayerAttribute;
use App\Models\GamePlayerDevelopment;
use App\Services\Players\PlayerGenerator;
use Illuminate\Support\Facades\DB;

/** Changes a player's attributes inside one game save and keeps the history of it. */
class DevelopmentService
{
    public function __construct(private readonly PlayerGenerator $ratings) {}

    /**
     * Apply attribute changes (e.g. ['shooting' => 2, 'stamina' => -1]) to one save's player.
     * Overall, potential and market value follow. The catalogue player is not touched.
     *
     * @param  array<string, int>  $changes
     */
    public function apply(GamePlayer $player, array $changes, string $reason): GamePlayerDevelopment
    {
        return DB::transaction(function () use ($player, $changes, $reason) {
            $a = GamePlayerAttribute::where('game_player_id', $player->id)->lockForUpdate()->firstOrFail();
            $save = $player->gameSave;
            $catalogue = $player->player;
            $before = $a->overall;
            $applied = [];
            foreach (array_intersect_key($changes, array_flip(GamePlayerAttribute::SKILLS)) as $skill => $delta) {
                $new = max(1, min(99, $a->{$skill} + (int) $delta));
                if ($new !== $a->{$skill}) {
                    $applied[$skill] = $new - $a->{$skill};
                    $a->{$skill} = $new;
                }
            }
            $age = $catalogue->ageOn($save->game_date);
            $a->overall = $this->ratings->overallFor($catalogue->primary_position->value, $a->skills());
            $a->potential = max($a->potential, $a->overall);
            $a->market_value = $this->ratings->marketValue($a->overall, $a->potential, $age);
            $a->wage_expectation = $this->ratings->wageFor($a->market_value);
            $a->save();

            return GamePlayerDevelopment::create([
                'game_player_id' => $player->id, 'season' => $save->season, 'game_date' => $save->game_date, 'age' => $age,
                'overall_before' => $before, 'overall_after' => $a->overall, 'potential' => $a->potential,
                'changes' => $applied, 'reason' => $reason,
            ]);
        });
    }
}
