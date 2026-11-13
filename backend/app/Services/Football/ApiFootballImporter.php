<?php

namespace App\Services\Football;

use App\Enums\PlayerOrigin;
use App\Models\Club;
use App\Models\Country;
use App\Models\League;
use App\Models\Player;
use App\Models\PlayerCareer;
use App\Models\PlayerExternalId;
use App\Services\Players\PlayerGenerator;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Maps API-Football records into the catalogue tables (countries, leagues, clubs, players and
 * their external ids, careers and photos). Importing the same record again updates it instead
 * of adding a copy. It never writes to game_* tables, so a save's attributes and progression
 * are untouched by a sync.
 */
class ApiFootballImporter
{
    /** @var array{created: int, updated: int} */
    public array $counts = ['created' => 0, 'updated' => 0];

    private string $provider;

    public function __construct()
    {
        $this->provider = config('football.provider');
    }

    /** @param array{league: array, country?: array} $item */
    public function importLeague(array $item): League
    {
        $league = League::updateOrCreate(
            ['provider' => $this->provider, 'external_id' => (string) $item['league']['id']],
            ['name' => $item['league']['name'], 'country_id' => $this->country($item['country']['name'] ?? null)?->id, 'is_fictional' => false],
        );
        $this->count($league);

        return $league;
    }

    /** @param array{team: array} $item */
    public function importClub(array $item, ?League $league = null): Club
    {
        $team = $item['team'];
        $club = Club::updateOrCreate(
            ['provider' => $this->provider, 'external_id' => (string) $team['id']],
            array_filter([
                'name' => $team['name'],
                'short_name' => isset($team['code']) ? substr($team['code'], 0, 12) : null,
                'league_id' => $league?->id,
                'country_id' => $this->country($team['country'] ?? null)?->id,
            ], fn ($v) => $v !== null) + ['is_fictional' => false],
        );
        $this->count($club);

        return $club;
    }

    /**
     * One player with profile, photo and season statistics.
     *
     * @param  array{player: array, statistics?: list<array>}  $entry
     */
    public function importPlayer(array $entry, ?Club $club = null): Player
    {
        $profile = $entry['player'];
        $externalId = (string) $profile['id'];
        $stats = $this->mainStatistics($entry['statistics'] ?? []);
        $data = $this->playerData($profile, $stats, $club);

        try {
            $player = DB::transaction(function () use ($externalId, $data) {
                $link = PlayerExternalId::where(['provider' => $this->provider, 'external_id' => $externalId])->first();
                if ($link) {
                    $link->player->update($data);
                    $this->counts['updated']++;

                    return $link->player;
                }
                $player = Player::create($data);
                $player->externalIds()->create(['provider' => $this->provider, 'external_id' => $externalId]);
                $this->counts['created']++;

                return $player;
            });
        } catch (UniqueConstraintViolationException) {
            // another worker imported the same player a moment ago; use theirs
            $player = PlayerExternalId::where(['provider' => $this->provider, 'external_id' => $externalId])->firstOrFail()->player;
            $player->update($data);
            $this->counts['updated']++;
        }

        if (! empty($profile['photo'])) {
            $player->photos()->firstOrCreate(['url' => $profile['photo']], ['source' => $this->provider, 'is_primary' => ! $player->photos()->exists()]);
        }
        foreach ($entry['statistics'] ?? [] as $line) {
            $this->importSeason($player, $line);
        }

        return $player;
    }

    /**
     * A player's transfer history.
     *
     * @param  list<array{date?: string, type?: string, teams?: array}>  $transfers
     */
    public function importTransfers(Player $player, array $transfers): int
    {
        $added = 0;
        foreach ($transfers as $t) {
            $date = $this->date($t['date'] ?? null);
            $in = $t['teams']['in'] ?? [];
            $out = $t['teams']['out'] ?? [];
            if (! $date || (empty($in['id']) && empty($out['id']))) {
                continue;
            }
            $row = PlayerCareer::updateOrCreate(
                ['player_id' => $player->id, 'kind' => PlayerCareer::KIND_TRANSFER, 'external_key' => "{$date}:".($out['id'] ?? 0).':'.($in['id'] ?? 0)],
                [
                    'club_id' => $this->knownClub($in['id'] ?? null), 'club_name' => $in['name'] ?? null,
                    'from_club_id' => $this->knownClub($out['id'] ?? null), 'from_club_name' => $out['name'] ?? null,
                    'transfer_date' => $date, 'transfer_type' => isset($t['type']) ? substr((string) $t['type'], 0, 60) : null,
                    'provider' => $this->provider,
                ],
            );
            $added += $row->wasRecentlyCreated ? 1 : 0;
        }
        $this->counts['created'] += $added;

        return $added;
    }

    private function importSeason(Player $player, array $line): void
    {
        $season = $line['league']['season'] ?? null;
        if (! $season || empty($line['team']['id'])) {
            return;
        }
        PlayerCareer::updateOrCreate(
            ['player_id' => $player->id, 'kind' => PlayerCareer::KIND_SEASON, 'external_key' => "$season:{$line['team']['id']}:".($line['league']['id'] ?? 0)],
            [
                'club_id' => $this->knownClub($line['team']['id']), 'club_name' => $line['team']['name'] ?? null,
                'season' => $season, 'league_name' => $line['league']['name'] ?? null,
                'appearances' => (int) ($line['games']['appearences'] ?? 0), 'minutes' => (int) ($line['games']['minutes'] ?? 0),
                'goals' => (int) ($line['goals']['total'] ?? 0), 'assists' => (int) ($line['goals']['assists'] ?? 0),
                'rating' => isset($line['games']['rating']) ? round((float) $line['games']['rating'], 2) : null,
                'provider' => $this->provider,
            ],
        );
    }

    /** Catalogue columns for a real player, with ratings worked out from the season's match rating. */
    private function playerData(array $profile, ?array $stats, ?Club $club): array
    {
        $id = (int) $profile['id'];
        $birth = $this->date($profile['birth']['date'] ?? null) ?? Carbon::today()->subYears((int) ($profile['age'] ?? 25))->toDateString();
        $age = (int) Carbon::parse($birth)->diffInYears(Carbon::today());
        $choices = config('football.positions')[$stats['games']['position'] ?? ''] ?? config('football.positions.Midfielder');
        $position = $choices[$id % count($choices)];

        $r = config('football.rating');
        $rating = (int) ($stats['games']['minutes'] ?? 0) >= config('football.min_minutes') ? ($stats['games']['rating'] ?? null) : null;
        $target = match (true) {
            $rating !== null => (int) round($r['overall_at_pivot'] + ((float) $rating - $r['pivot']) * $r['per_point']),
            ($stats['games']['rating'] ?? null) === null => $this->estimate($id, $stats),
            default => $r['unrated'],
        };
        $target = max($r['min'], min($r['max'], $target));

        // seeded by the external id: importing again gives the same attributes for the same rating
        $generator = new PlayerGenerator(seed: $id);
        $attributes = $generator->attributesFor($position, $target);
        $overall = $generator->overallFor($position, $attributes);
        $potential = $generator->potentialFor($overall, $age);
        $value = $generator->marketValue($overall, $potential, $age);

        return [
            'origin' => PlayerOrigin::Real->value,
            'name' => $this->displayName($profile),
            'first_name' => $profile['firstname'] ?? null,
            'last_name' => $profile['lastname'] ?? null,
            'birth_date' => $birth,
            'country_id' => $this->country($profile['nationality'] ?? null)?->id,
            'club_id' => $club?->id,
            'primary_position' => $position,
            'height_cm' => ((int) ($profile['height'] ?? 0)) ?: null,
            'base_overall' => $overall,
            'base_potential' => $potential,
            'base_attributes' => $attributes,
            'base_market_value' => $value,
            'base_wage' => $generator->wageFor($value),
        ];
    }

    /**
     * An overall for a league the API has no match ratings for (Liga 1 Indonesia, among others):
     * the more of the season a player played, the better they are taken to be, plus a little for
     * goals and assists. Without this every player of such a league would get the same number.
     */
    private function estimate(int $id, ?array $stats): int
    {
        $e = config('football.estimate');
        $minutes = (int) ($stats['games']['minutes'] ?? 0);
        if ($minutes <= 0) {
            return $e['floor'] + $id % $e['idle_spread'];
        }
        $bonus = (int) ($stats['goals']['total'] ?? 0) * $e['per_goal'] + (int) ($stats['goals']['assists'] ?? 0) * $e['per_assist'];

        return (int) round($e['floor'] + $e['full_season'] * min(1, $minutes / $e['full_season_minutes']) + min($e['max_bonus'], $bonus));
    }

    /** The API's short name is the familiar one; only an initial ("P. Foden") is spelled out. */
    private function displayName(array $profile): string
    {
        $name = (string) $profile['name'];
        $firsts = array_values(array_filter(explode(' ', (string) ($profile['firstname'] ?? ''))));
        if ($firsts && preg_match('/^(\p{L})\. (.+)$/u', $name, $m)) {
            $first = collect($firsts)->first(fn ($f) => str_starts_with($f, $m[1])) ?? $firsts[0];

            return "$first {$m[2]}";
        }

        return $name;
    }

    /** The statistics line with the most minutes. */
    private function mainStatistics(array $lines): ?array
    {
        return collect($lines)->sortByDesc(fn ($l) => (int) ($l['games']['minutes'] ?? 0))->first();
    }

    private function country(?string $name): ?Country
    {
        return $name ? Country::firstOrCreate(['name' => $name]) : null;
    }

    private function knownClub(int|string|null $externalId): ?int
    {
        return $externalId ? Club::where(['provider' => $this->provider, 'external_id' => (string) $externalId])->value('id') : null;
    }

    private function date(?string $value): ?string
    {
        try {
            return $value ? Carbon::parse($value)->toDateString() : null;
        } catch (\Throwable) {
            return null;
        }
    }

    private function count(League|Club $model): void
    {
        $this->counts[$model->wasRecentlyCreated ? 'created' : 'updated']++;
    }
}
