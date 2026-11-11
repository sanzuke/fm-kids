<?php

namespace App\Services\Players;

use App\Enums\PlayerOrigin;
use App\Models\Country;
use App\Models\Player;
use Illuminate\Support\Carbon;
use InvalidArgumentException;
use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * Invents fictional players from the weighted distributions in config/player_generator.php.
 * The same seed always gives the same players. Its rating maths (attributesFor, overallFor,
 * marketValue, wageFor) is also used for real players, so both origins are rated alike.
 */
class PlayerGenerator
{
    private Randomizer $random;

    /** @var array<string, mixed> */
    private array $config;

    /** @var array<string, true> names handed out by this generator */
    private array $usedNames = [];

    /** @var array<string, int>|null country code => id */
    private ?array $countryIds = null;

    /** @param array<string, mixed>|null $config overrides config('player_generator') */
    public function __construct(?int $seed = null, ?array $config = null)
    {
        $this->config = $config ?? config('player_generator');
        $this->random = new Randomizer(new Mt19937($seed ?? random_int(0, PHP_INT_MAX)));
    }

    public function seed(int $seed): static
    {
        $this->random = new Randomizer(new Mt19937($seed));

        return $this;
    }

    /**
     * One fictional player as attributes for the players table (country as a code, not an id).
     * Overrides: position, age, overall, nationality, name, club_id.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public function generate(array $overrides = [], ?Carbon $today = null): array
    {
        $today = ($today ?? Carbon::today())->copy();
        $position = $overrides['position'] ?? $this->weighted($this->config['position_weights']);
        if (! isset($this->config['attribute_weights'][$position])) {
            throw new InvalidArgumentException("Unknown position [$position].");
        }
        $age = $overrides['age'] ?? $this->age();
        $o = $this->config['overall'];
        $target = $overrides['overall'] ?? $this->clamp($o['mean'] + $this->random->getInt(-$o['spread'], $o['spread']), $o['min'], $o['max']);
        $attributes = $this->attributesFor($position, $target);
        $overall = $this->overallFor($position, $attributes);
        $potential = $this->potentialFor($overall, $age);
        $value = $this->marketValue($overall, $potential, $age);
        [$first, $last] = $this->name($overrides['name'] ?? null);

        return [
            'origin' => PlayerOrigin::Fictional->value,
            'name' => "$first $last",
            'first_name' => $first,
            'last_name' => $last,
            'birth_date' => $today->subYears($age)->subDays($this->random->getInt(0, 364))->toDateString(),
            'nationality' => $overrides['nationality'] ?? $this->weighted($this->config['nationality_weights']),
            'club_id' => $overrides['club_id'] ?? null,
            'primary_position' => $position,
            'secondary_positions' => $this->secondaryPositions($position),
            'preferred_foot' => $this->weighted($this->config['foot_weights_by_position'][$position] ?? $this->config['foot_weights']),
            'personality' => $this->weighted($this->config['personality_weights']),
            'base_overall' => $overall,
            'base_potential' => $potential,
            'base_attributes' => $attributes,
            'base_market_value' => $value,
            'base_wage' => $this->wageFor($value),
        ];
    }

    /** Generate and store one fictional player. */
    public function create(array $overrides = [], ?Carbon $today = null): Player
    {
        $data = $this->generate($overrides, $today);
        $data['country_id'] = $this->countryId($data['nationality']);
        unset($data['nationality']);

        return Player::create($data);
    }

    /**
     * Six attributes that suit the position and average out to about the target overall.
     *
     * @return array<string, int>
     */
    public function attributesFor(string $position, int $target): array
    {
        $weights = $this->config['attribute_weights'][$position];
        $noise = $this->config['attribute_noise'];
        $offsets = [];
        $weighted = 0.0;
        foreach ($weights as $i => $w) {
            // key attributes of the position are lifted, the others lowered, plus a random wobble
            $offsets[$i] = ($w - 1 / count($weights)) * $this->config['attribute_emphasis'] + ($this->random->nextFloat() - 0.5) * $noise;
            $weighted += $w * $offsets[$i];
        }
        $base = $target - $weighted;
        $out = [];
        foreach ($this->config['attributes'] as $i => $name) {
            $out[$name] = $this->clamp((int) round($base + $offsets[$i]), $this->config['attribute_min'], $this->config['attribute_max']);
        }

        return $out;
    }

    /** @param array<string, int> $attributes */
    public function overallFor(string $position, array $attributes): int
    {
        $sum = 0.0;
        foreach ($this->config['attributes'] as $i => $name) {
            $sum += $attributes[$name] * $this->config['attribute_weights'][$position][$i];
        }

        return $this->clamp((int) round($sum), 1, 99);
    }

    public function potentialFor(int $overall, int $age): int
    {
        foreach ($this->config['growth_by_age'] as [$maxAge, $min, $max]) {
            if ($age <= $maxAge) {
                return $this->clamp($overall + $this->random->getInt($min, $max), $overall, 96);
            }
        }

        return $overall;
    }

    public function marketValue(int $overall, int $potential, int $age): int
    {
        $v = $this->config['value'];
        $base = $v['base'] * exp(($overall - $v['pivot']) * $v['growth']);
        $potentialFactor = 1 + max(0, $potential - $overall) * $v['potential_bonus'] * ($age < 24 ? 1 : 0.3);
        $ageFactor = $age < 22 ? 1.1 : ($age <= 28 ? 1 : ($age <= 31 ? 0.8 : 0.55));

        return max($v['minimum'], (int) (round($base * $potentialFactor * $ageFactor / 10) * 10));
    }

    public function wageFor(int $marketValue): int
    {
        return max(1, (int) round($marketValue * $this->config['wage_ratio']));
    }

    /**
     * Draw one key from a [choice => weight] list.
     *
     * @param  array<int|string, int|float>  $weights
     */
    public function weighted(array $weights): int|string
    {
        $total = array_sum($weights);
        if ($total <= 0) {
            throw new InvalidArgumentException('Weights must add up to more than zero.');
        }
        $roll = $this->random->nextFloat() * $total;
        foreach ($weights as $choice => $weight) {
            if (($roll -= $weight) < 0) {
                return $choice;
            }
        }

        return array_key_last($weights);
    }

    private function age(): int
    {
        $bands = $this->config['age_bands'];
        $i = $this->weighted(array_column($bands, 2));

        return $this->random->getInt($bands[$i][0], $bands[$i][1]);
    }

    /** @return list<string> */
    private function secondaryPositions(string $position): array
    {
        $choices = $this->config['secondary_position_weights'][$position] ?? [];
        $count = min((int) $this->weighted($this->config['secondary_count_weights']), count($choices));
        $picked = [];
        for ($i = 0; $i < $count; $i++) {
            $p = (string) $this->weighted($choices);
            $picked[] = $p;
            unset($choices[$p]);
        }

        return $picked;
    }

    /** @return array{0: string, 1: string} */
    private function name(?string $fixed): array
    {
        if ($fixed !== null) {
            return array_pad(explode(' ', $fixed, 2), 2, '');
        }
        $firsts = $this->config['first_names'];
        $lasts = $this->config['last_names'];
        for ($try = 0; ; $try++) {
            $first = $firsts[$this->random->getInt(0, count($firsts) - 1)];
            $last = $lasts[$this->random->getInt(0, count($lasts) - 1)];
            // once plain pairs run short, a second surname keeps names apart
            if ($try >= 20) {
                $last .= '-'.$lasts[$this->random->getInt(0, count($lasts) - 1)];
            }
            if (! isset($this->usedNames["$first $last"])) {
                $this->usedNames["$first $last"] = true;

                return [$first, $last];
            }
        }
    }

    private function countryId(string $code): ?int
    {
        $this->countryIds ??= Country::whereNotNull('code')->pluck('id', 'code')->all();
        if (! isset($this->countryIds[$code]) && isset($this->config['countries'][$code])) {
            $this->countryIds[$code] = Country::firstOrCreate(['code' => $code], ['name' => $this->config['countries'][$code]])->id;
        }

        return $this->countryIds[$code] ?? null;
    }

    private function clamp(int $value, int $min, int $max): int
    {
        return max($min, min($max, $value));
    }
}
