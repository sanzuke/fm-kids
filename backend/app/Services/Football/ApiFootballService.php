<?php

namespace App\Services\Football;

use App\Exceptions\ApiFootballException;
use App\Exceptions\ApiRateLimitedException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Factory as Http;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Throwable;

/**
 * Thin client for API-Football v3. It only fetches; ApiFootballImporter maps the answers
 * into the database. Every call counts against a per-minute limit kept in the cache, and a
 * used-up daily quota is remembered until it resets, so no request is wasted on a sure refusal.
 */
class ApiFootballService
{
    private const MINUTE_KEY = 'api-football:minute';

    private const DAILY_KEY = 'api-football:daily-exhausted-until';

    /** @param array<string, mixed>|null $config overrides config('football') */
    public function __construct(private readonly Http $http, private ?array $config = null)
    {
        $this->config ??= config('football');
    }

    /** League records: [{league: {...}, country: {...}, seasons: [...]}] */
    public function leagues(array $query = []): array
    {
        return $this->get('leagues', $query)['response'];
    }

    /** Clubs of a league season: [{team: {...}, venue: {...}}] */
    public function clubs(int $league, int $season): array
    {
        return $this->get('teams', ['league' => $league, 'season' => $season])['response'];
    }

    /**
     * One page of a club's players with profile and season statistics.
     *
     * @return array{players: list<array>, page: int, pages: int}
     */
    public function clubPlayers(int $club, int $season, int $page = 1): array
    {
        $body = $this->get('players', ['team' => $club, 'season' => $season, 'page' => $page]);

        return ['players' => $body['response'], 'page' => (int) ($body['paging']['current'] ?? $page), 'pages' => (int) ($body['paging']['total'] ?? 1)];
    }

    /** One player's profile and statistics for a season, or null when the API has none. */
    public function player(int $player, int $season): ?array
    {
        return $this->get('players', ['id' => $player, 'season' => $season])['response'][0] ?? null;
    }

    /** A player's transfer history: [{date, type, teams: {in: {...}, out: {...}}}] */
    public function playerTransfers(int $player): array
    {
        return $this->get('transfers', ['player' => $player])['response'][0]['transfers'] ?? [];
    }

    /**
     * @param  array<string, scalar>  $query
     * @return array{response: array, paging?: array}
     */
    protected function get(string $path, array $query = []): array
    {
        if (empty($this->config['key'])) {
            throw new ApiFootballException('API_FOOTBALL_TOKEN is not set.');
        }
        $this->reserveRequest();

        try {
            $response = $this->http
                ->baseUrl($this->config['base_url'])
                ->withHeaders(['x-apisports-key' => $this->config['key']])
                ->acceptJson()
                ->timeout($this->config['timeout'])
                ->retry(
                    $this->config['retries'],
                    fn (int $attempt) => $attempt * $this->config['retry_wait_ms'],
                    fn (Throwable $e) => $e instanceof ConnectionException || ($e instanceof RequestException && $e->response->serverError()),
                    throw: false,
                )
                ->get($path, $query);
        } catch (ConnectionException $e) {
            throw new ApiFootballException("API-Football could not be reached: {$e->getMessage()}", previous: $e);
        }

        if ($response->header('x-ratelimit-requests-remaining') === '0') {
            $this->rememberDailyLimit();
        }
        if ($response->status() === 429) {
            throw new ApiRateLimitedException(max(1, (int) ($response->header('Retry-After') ?: 60)));
        }
        if ($response->failed()) {
            throw new ApiFootballException("API-Football answered HTTP {$response->status()} for [$path].");
        }

        $body = $response->json();
        if (! is_array($body) || ! array_key_exists('response', $body)) {
            throw new ApiFootballException("API-Football sent an unreadable answer for [$path].");
        }
        // errors arrive with HTTP 200, as a list or as {field: message}
        $errors = (array) ($body['errors'] ?? []);
        if ($errors !== []) {
            if (isset($errors['rateLimit'])) {
                throw new ApiRateLimitedException(60, (string) $errors['rateLimit']);
            }
            if (isset($errors['requests'])) {
                throw new ApiRateLimitedException($this->rememberDailyLimit(), (string) $errors['requests']);
            }
            throw new ApiFootballException("API-Football refused [$path]: ".json_encode($errors));
        }

        return $body;
    }

    /** Take one slot of this minute's allowance, or say when the next one frees up. */
    private function reserveRequest(): void
    {
        $until = Cache::get(self::DAILY_KEY);
        if ($until && Carbon::parse($until)->isFuture()) {
            throw new ApiRateLimitedException((int) ceil(abs(now()->diffInSeconds(Carbon::parse($until)))), 'API-Football daily quota is used up.');
        }
        if (RateLimiter::tooManyAttempts(self::MINUTE_KEY, $this->config['requests_per_minute'])) {
            throw new ApiRateLimitedException(max(1, RateLimiter::availableIn(self::MINUTE_KEY)));
        }
        RateLimiter::hit(self::MINUTE_KEY, 60);
    }

    /** The daily quota resets at midnight UTC. Returns the seconds until then. */
    private function rememberDailyLimit(): int
    {
        $reset = now('UTC')->addDay()->startOfDay();
        Cache::put(self::DAILY_KEY, $reset->toIso8601String(), $reset);

        return (int) ceil(abs(now()->diffInSeconds($reset)));
    }
}
