<?php

namespace Tests\Unit;

use App\Enums\PlayerOrigin;
use App\Enums\Position;
use App\Models\Player;
use App\Services\Players\PlayerGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PlayerGeneratorTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_same_seed_gives_the_same_players(): void
    {
        $today = Carbon::parse('2026-07-01');
        $a = (new PlayerGenerator(seed: 7))->generate(today: $today);
        $b = (new PlayerGenerator(seed: 7))->generate(today: $today);
        $c = (new PlayerGenerator(seed: 8))->generate(today: $today);

        $this->assertSame($a, $b);
        $this->assertNotSame($a, $c);
    }

    public function test_a_generated_player_has_every_part_of_a_profile(): void
    {
        $generator = new PlayerGenerator(seed: 1);
        $today = Carbon::parse('2026-07-01');

        for ($i = 0; $i < 300; $i++) {
            $p = $generator->generate(today: $today);
            $age = (int) Carbon::parse($p['birth_date'])->diffInYears($today);

            $this->assertSame('fictional', $p['origin']);
            $this->assertMatchesRegularExpression('/^\S+ \S+$/', $p['name']);
            $this->assertArrayHasKey($p['nationality'], config('player_generator.countries'));
            $this->assertContains($p['primary_position'], Position::values());
            $this->assertNotContains($p['primary_position'], $p['secondary_positions']);
            $this->assertSame($p['secondary_positions'], array_unique($p['secondary_positions']));
            $this->assertGreaterThanOrEqual(15, $age);
            $this->assertLessThanOrEqual(35, $age);
            $this->assertGreaterThanOrEqual(30, $p['base_overall']);
            $this->assertLessThanOrEqual(90, $p['base_overall'] - 0);
            $this->assertGreaterThanOrEqual($p['base_overall'], $p['base_potential']);
            $this->assertLessThanOrEqual(96, $p['base_potential']);
            $this->assertGreaterThan(0, $p['base_market_value']);
            $this->assertGreaterThan(0, $p['base_wage']);
            $this->assertContains($p['preferred_foot'], ['left', 'right', 'both']);
            $this->assertArrayHasKey($p['personality'], config('player_generator.personality_weights'));
            $this->assertSame(config('player_generator.attributes'), array_keys($p['base_attributes']));
        }
    }

    public function test_names_are_not_repeated(): void
    {
        $generator = new PlayerGenerator(seed: 3);
        $names = [];
        for ($i = 0; $i < 1500; $i++) {
            $names[] = $generator->generate()['name'];
        }

        $this->assertCount(1500, array_unique($names));
    }

    public function test_attributes_suit_the_position(): void
    {
        $generator = new PlayerGenerator(seed: 11);
        $avg = [];
        foreach (['GK', 'CB', 'CM', 'ST', 'LW'] as $position) {
            $sum = array_fill_keys(config('player_generator.attributes'), 0);
            for ($i = 0; $i < 100; $i++) {
                $attributes = $generator->attributesFor($position, 60);
                // the overall worked out from the attributes stays close to what was asked for
                $this->assertEqualsWithDelta(60, $generator->overallFor($position, $attributes), 2);
                foreach ($attributes as $k => $v) {
                    $sum[$k] += $v / 100;
                }
            }
            $avg[$position] = $sum;
        }

        $this->assertGreaterThan($avg['ST']['defending'] + 15, $avg['ST']['shooting']);
        $this->assertGreaterThan($avg['CB']['shooting'] + 15, $avg['CB']['defending']);
        $this->assertGreaterThan($avg['GK']['shooting'] + 15, $avg['GK']['defending']);
        $this->assertGreaterThan($avg['CB']['passing'], $avg['CM']['passing']);
        $this->assertGreaterThan($avg['CB']['speed'], $avg['LW']['speed']);
    }

    public function test_weighted_distributions_follow_the_configuration(): void
    {
        $config = config('player_generator');
        $config['position_weights'] = ['GK' => 0, 'ST' => 3, 'CB' => 1];
        $config['nationality_weights'] = ['IDN' => 1];
        $config['foot_weights'] = ['left' => 1];
        $config['foot_weights_by_position'] = [];
        $config['age_bands'] = [[16, 16, 1]];
        $generator = new PlayerGenerator(seed: 5, config: $config);

        $positions = ['ST' => 0, 'CB' => 0];
        for ($i = 0; $i < 2000; $i++) {
            $p = $generator->generate(today: Carbon::parse('2026-07-01'));
            $positions[$p['primary_position']]++;
            $this->assertSame('IDN', $p['nationality']);
            $this->assertSame('left', $p['preferred_foot']);
            $this->assertSame(16, (int) Carbon::parse($p['birth_date'])->diffInYears(Carbon::parse('2026-07-01')));
        }

        // never the zero-weight choice, and about three strikers for every centre-back
        $this->assertSame(2000, $positions['ST'] + $positions['CB']);
        $this->assertEqualsWithDelta(0.75, $positions['ST'] / 2000, 0.04);
    }

    public function test_goalkeepers_have_no_secondary_position(): void
    {
        $generator = new PlayerGenerator(seed: 9);
        for ($i = 0; $i < 50; $i++) {
            $this->assertSame([], $generator->generate(['position' => 'GK'])['secondary_positions']);
        }
    }

    public function test_value_and_wage_grow_with_rating_and_youth(): void
    {
        $generator = new PlayerGenerator(seed: 1);

        $this->assertGreaterThan($generator->marketValue(50, 50, 25), $generator->marketValue(70, 70, 25));
        $this->assertGreaterThan($generator->marketValue(60, 60, 20), $generator->marketValue(60, 80, 20));
        $this->assertGreaterThan($generator->marketValue(60, 60, 33), $generator->marketValue(60, 60, 25));
        $this->assertGreaterThan($generator->wageFor(1000), $generator->wageFor(5000));
    }

    public function test_create_stores_a_fictional_player(): void
    {
        $player = (new PlayerGenerator(seed: 2))->create(['position' => 'ST', 'nationality' => 'IDN', 'age' => 19]);

        $this->assertInstanceOf(Player::class, $player);
        $this->assertTrue($player->exists);
        $this->assertSame(PlayerOrigin::Fictional, $player->origin);
        $this->assertSame(Position::ST, $player->primary_position);
        $this->assertSame('Indonesia', $player->country->name);
        $this->assertSame(19, $player->ageOn());
        $this->assertSame(0, $player->externalIds()->count());
    }
}
