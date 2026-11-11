<?php

namespace Tests\Feature;

use App\Models\Club;
use App\Models\League;
use App\Models\Player;
use App\Models\PlayerExternalId;
use App\Services\Players\PlayerGenerator;
use Database\Seeders\FictionalWorldSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PlayerDatabaseTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_seeder_builds_the_fictional_world_once(): void
    {
        $this->seed(FictionalWorldSeeder::class);

        $this->assertSame(3, League::count());
        $this->assertSame(24, Club::count());
        $this->assertSame(24 * 16 + FictionalWorldSeeder::FREE_AGENTS, Player::count());
        $this->assertSame(Player::count(), Player::distinct()->count('name'));
        $this->assertSame(0, Player::where('origin', 'real')->count());
        // every club can field a full team with a goalkeeper
        $this->assertSame(24, Player::where('primary_position', 'GK')->whereNotNull('club_id')->distinct()->count('club_id'));

        $this->seed(FictionalWorldSeeder::class);
        $this->assertSame(24, Club::count());
        $this->assertSame(24 * 16 + FictionalWorldSeeder::FREE_AGENTS, Player::count());
    }

    public function test_an_external_record_can_belong_to_one_player_only(): void
    {
        $generator = new PlayerGenerator(seed: 1);
        $a = $generator->create();
        $b = $generator->create();
        $a->externalIds()->create(['provider' => 'api-football', 'external_id' => '42']);

        // the same id at another provider is a different record
        $b->externalIds()->create(['provider' => 'other-api', 'external_id' => '42']);
        $this->assertSame(2, PlayerExternalId::count());

        $this->expectException(UniqueConstraintViolationException::class);
        $b->externalIds()->create(['provider' => 'api-football', 'external_id' => '42']);
    }

    public function test_the_database_refuses_invalid_players(): void
    {
        $player = (new PlayerGenerator(seed: 1))->create();

        foreach ([['primary_position' => 'XX'], ['origin' => 'alien'], ['base_overall' => 0], ['base_potential' => $player->base_overall - 1], ['preferred_foot' => 'none']] as $bad) {
            try {
                DB::transaction(fn () => DB::table('players')->where('id', $player->id)->update($bad));
                $this->fail('Expected a constraint to refuse '.json_encode($bad));
            } catch (QueryException $e) {
                $this->assertStringContainsString('check constraint', $e->getMessage());
            }
        }
    }

    public function test_players_can_be_searched_and_filtered(): void
    {
        $generator = new PlayerGenerator(seed: 4);
        $on = '2026-07-01';
        $today = Carbon::parse($on);
        $young = $generator->create(['name' => 'Bima Rocket', 'position' => 'ST', 'nationality' => 'IDN', 'age' => 17], $today);
        $old = $generator->create(['name' => 'Otto Thunder', 'position' => 'CB', 'nationality' => 'GER', 'age' => 31], $today);
        $old->update(['secondary_positions' => ['CDM']]);
        $real = $generator->create(['name' => 'Rio Rocketman', 'position' => 'GK', 'nationality' => 'BRA', 'age' => 24], $today);
        $real->update(['origin' => 'real']);

        $ids = fn (array $filters) => Player::filter($filters, $on)->orderBy('id')->pluck('id')->all();

        $this->assertSame([$young->id, $real->id], $ids(['search' => 'rocket']));
        $this->assertSame([$old->id], $ids(['position' => 'CB']));
        $this->assertSame([$old->id], $ids(['position' => 'CDM']));
        $this->assertSame([$real->id], $ids(['origin' => 'real']));
        $this->assertSame([$young->id], $ids(['nationality' => 'idn']));
        $this->assertSame([$old->id], $ids(['nationality' => 'Germany']));
        $this->assertSame([$old->id, $real->id], $ids(['min_age' => 24]));
        $this->assertSame([$young->id, $real->id], $ids(['max_age' => 24]));
        $this->assertSame([$real->id], $ids(['min_age' => 18, 'max_age' => 30]));
        $this->assertSame([], $ids(['origin' => 'real', 'position' => 'ST']));
    }
}
