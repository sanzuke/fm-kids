<?php

namespace Database\Seeders;

use App\Models\Club;
use App\Models\Country;
use App\Models\League;
use App\Models\Player;
use App\Services\Players\PlayerGenerator;
use Illuminate\Database\Seeder;

/**
 * The fictional part of the catalogue: three leagues of eight clubs with generated squads,
 * plus generated free agents. Safe to run again: existing leagues are left alone.
 */
class FictionalWorldSeeder extends Seeder
{
    private const LEAGUES = [
        ['Gold League', 64, ['Golden Lions', 'Thunder Hawks', 'Royal Dragons', 'Sky Rockets', 'Crimson Wolves', 'Ocean Sharks', 'Star Tigers', 'Emerald Eagles']],
        ['Silver League', 55, ['Sunny Foxes', 'Blue Bears', 'Lucky Stars', 'Fire Pandas', 'Jungle Monkeys', 'Silver Owls', 'Purple Panthers', 'Mighty Mammoths']],
        ['Bronze League', 46, ['Happy Hippos', 'Tiny Turtles', 'Bouncy Bunnies', 'Speedy Snails', 'Cheeky Chicks', 'Wobbly Whales', 'Zippy Zebras', 'Dizzy Ducks']],
    ];

    private const SQUAD = ['GK', 'GK', 'CB', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST', 'CM'];

    private const COLORS = [['#e63946', '#ffffff'], ['#1d6fe0', '#ffd23f'], ['#2ecc71', '#ffffff'], ['#ffd23f', '#1d2b53'], ['#8e44ad', '#ffffff'], ['#ff8c1a', '#1d2b53'], ['#00b3b3', '#ffffff'], ['#222b45', '#ff6b6b']];

    public const FREE_AGENTS = 45;

    public function run(): void
    {
        foreach (config('player_generator.countries') as $code => $name) {
            Country::firstOrCreate(['code' => $code], ['name' => $name]);
        }
        $generator = new PlayerGenerator(seed: 20261111);

        foreach (self::LEAGUES as $tier => [$leagueName, $level, $clubs]) {
            $league = League::firstOrCreate(['name' => $leagueName, 'is_fictional' => true], ['tier' => $tier + 1]);
            if (! $league->wasRecentlyCreated) {
                continue;
            }
            foreach ($clubs as $i => $clubName) {
                $club = Club::create([
                    'league_id' => $league->id, 'name' => $clubName, 'short_name' => strtoupper(substr(str_replace(' ', '', $clubName), 0, 3)),
                    'is_fictional' => true, 'reputation' => max(1, 70 - $tier * 20 + ($i % 4) * 3),
                    'primary_color' => self::COLORS[$i][0], 'secondary_color' => self::COLORS[$i][1],
                ]);
                foreach (self::SQUAD as $slot => $position) {
                    // starters are a little better than the bench
                    $overall = $level + ($slot < 11 ? 2 : -5) + (($i + $slot * 3) % 9) - 4;
                    $generator->create(['position' => $position, 'overall' => $overall, 'club_id' => $club->id]);
                }
            }
        }

        if (! Player::where('origin', 'fictional')->whereNull('club_id')->exists()) {
            for ($i = 0; $i < self::FREE_AGENTS; $i++) {
                $generator->create(['overall' => 36 + ($i * 7) % 25]);
            }
        }
    }
}
