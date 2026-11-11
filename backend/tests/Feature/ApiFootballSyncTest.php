<?php

namespace Tests\Feature;

use App\Exceptions\ApiFootballException;
use App\Exceptions\ApiRateLimitedException;
use App\Jobs\SyncClubPlayersJob;
use App\Jobs\SyncLeagueJob;
use App\Jobs\SyncPlayerTransfersJob;
use App\Models\Club;
use App\Models\League;
use App\Models\Player;
use App\Models\PlayerCareer;
use App\Models\PlayerExternalId;
use App\Models\PlayerPhoto;
use App\Models\SyncLog;
use App\Services\Football\ApiFootballImporter;
use App\Services\Football\ApiFootballService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\Support\ApiFootballFixtures;
use Tests\TestCase;

class ApiFootballSyncTest extends TestCase
{
    use ApiFootballFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['football.retry_wait_ms' => 1]);
        Http::preventStrayRequests();
    }

    private function fakeApi(): void
    {
        Http::fake(function (Request $request) {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $q);
            $path = trim((string) parse_url($request->url(), PHP_URL_PATH), '/');

            return Http::response(match (true) {
                $path === 'leagues' => $this->apiBody([$this->apiLeague()]),
                $path === 'teams' => $this->apiBody([$this->apiClub(501, 'Test Rovers'), $this->apiClub(502, 'Sample United')]),
                $path === 'players' && $q['team'] === '501' && $q['page'] === '1' => $this->apiBody([$this->apiPlayer(1), $this->apiPlayer(2, 'Kiko')], 1, 2),
                $path === 'players' && $q['team'] === '501' => $this->apiBody([$this->apiPlayer(3, 'A. Third')], 2, 2),
                $path === 'players' => $this->apiBody([$this->apiPlayer(4, 'B. Fourth', ['statistics' => [[
                    'team' => ['id' => 502, 'name' => 'Sample United'], 'league' => ['id' => 900, 'name' => 'Test Premier Division', 'season' => 2024],
                    'games' => ['appearences' => 3, 'minutes' => 200, 'position' => 'Goalkeeper', 'rating' => null], 'goals' => ['total' => null, 'assists' => null],
                ]]])]),
                $path === 'transfers' => $this->apiBody($this->apiTransfers((int) $q['player'])),
            });
        });
    }

    public function test_a_league_sync_imports_clubs_players_careers_and_photos(): void
    {
        $this->fakeApi();

        SyncLeagueJob::dispatchSync(900, 2024, true);

        $league = League::sole();
        $this->assertSame(['Test Premier Division', 'api-football', '900', false], [$league->name, $league->provider, $league->external_id, $league->is_fictional]);
        $this->assertSame('Testland', $league->country->name);
        $this->assertSame(['Sample United', 'Test Rovers'], Club::orderBy('name')->pluck('name')->all());
        $this->assertSame(4, Player::count());
        $this->assertSame(4, PlayerExternalId::where('provider', 'api-football')->count());
        $this->assertSame(4, PlayerPhoto::where('is_primary', true)->count());

        $player = PlayerExternalId::where('external_id', '1')->sole()->player;
        $this->assertSame('real', $player->origin->value);
        $this->assertSame('Tomas Sample', $player->name);
        $this->assertSame('2002-03-14', $player->birth_date->toDateString());
        $this->assertSame('Test Rovers', $player->club->name);
        $this->assertSame('Testland', $player->country->name);
        $this->assertSame(181, $player->height_cm);
        $this->assertContains($player->primary_position->value, ['ST', 'LW', 'RW']);
        // rating 7.2 -> overall about 73
        $this->assertEqualsWithDelta(73, $player->base_overall, 2);

        $season = $player->careers()->where('kind', 'season')->sole();
        $this->assertSame([2024, 30, 2400, 12, 5, 7.2], [$season->season, $season->appearances, $season->minutes, $season->goals, $season->assists, $season->rating]);
        $this->assertSame(2, $player->careers()->where('kind', 'transfer')->count());
        $this->assertSame('Old Town', $player->careers()->where('transfer_date', '2023-07-01')->sole()->from_club_name);

        // an unrated goalkeeper still becomes a usable player
        $keeper = PlayerExternalId::where('external_id', '4')->sole()->player;
        $this->assertSame('GK', $keeper->primary_position->value);
        $this->assertEqualsWithDelta(55, $keeper->base_overall, 2);

        // league + 2 clubs x pages + 4 transfer histories, all logged
        $this->assertSame(0, SyncLog::where('status', '!=', 'success')->count());
        $this->assertSame(['club_players' => 3, 'league' => 1, 'player_transfers' => 4], SyncLog::selectRaw('resource, count(*) c')->groupBy('resource')->orderBy('resource')->pluck('c', 'resource')->all());
    }

    public function test_syncing_again_updates_instead_of_duplicating(): void
    {
        config(['football.requests_per_minute' => 100]);
        $this->fakeApi();
        SyncLeagueJob::dispatchSync(900, 2024, true);
        $before = [League::count(), Club::count(), Player::count(), PlayerExternalId::count(), PlayerCareer::count(), PlayerPhoto::count()];
        $ids = Player::orderBy('id')->pluck('id')->all();

        SyncLeagueJob::dispatchSync(900, 2024, true);

        $this->assertSame($before, [League::count(), Club::count(), Player::count(), PlayerExternalId::count(), PlayerCareer::count(), PlayerPhoto::count()]);
        $this->assertSame($ids, Player::orderBy('id')->pluck('id')->all());
        $this->assertSame(0, SyncLog::where('status', '!=', 'success')->count());
        $this->assertSame(4, SyncLog::where('resource', 'club_players')->latest('id')->take(3)->get()->sum('records_updated'));
    }

    public function test_a_changed_profile_updates_the_same_player(): void
    {
        $importer = new ApiFootballImporter;
        $first = $importer->importPlayer($this->apiPlayer(10, 'T. Sample'));
        $second = $importer->importPlayer($this->apiPlayer(10, 'T. Renamed', ['player' => ['lastname' => 'Renamed']]));

        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, Player::count());
        $this->assertSame('Tomas Renamed', $second->fresh()->name);
        $this->assertSame(['created' => 1, 'updated' => 1], $importer->counts);
    }

    public function test_the_key_is_sent_as_a_header_and_never_in_the_url(): void
    {
        $this->fakeApi();

        app(ApiFootballService::class)->clubs(900, 2024);

        Http::assertSent(fn (Request $r) => $r->hasHeader('x-apisports-key', 'test-token')
            && ! str_contains($r->url(), 'test-token')
            && str_starts_with($r->url(), 'https://v3.football.api-sports.io/teams?league=900&season=2024'));
    }

    public function test_a_missing_key_stops_before_any_request(): void
    {
        config(['football.key' => null]);
        Http::fake();

        try {
            app(ApiFootballService::class)->clubs(900, 2024);
            $this->fail('Expected an exception.');
        } catch (ApiFootballException $e) {
            $this->assertStringContainsString('API_FOOTBALL_TOKEN', $e->getMessage());
        }
        Http::assertNothingSent();
    }

    public function test_server_errors_are_retried(): void
    {
        Http::fakeSequence()->pushStatus(503)->pushStatus(500)->push($this->apiBody([$this->apiClub(501, 'Test Rovers')]));

        $clubs = app(ApiFootballService::class)->clubs(900, 2024);

        $this->assertCount(1, $clubs);
        Http::assertSentCount(3);
    }

    public function test_a_lasting_server_error_fails_the_job_and_is_logged(): void
    {
        Http::fake(fn () => Http::response('down', 502));
        $job = (new SyncClubPlayersJob(501, 2024))->withFakeQueueInteractions();

        try {
            $job->handle(new ApiFootballImporter);
            $this->fail('Expected an exception.');
        } catch (ApiFootballException $e) {
            $this->assertStringContainsString('HTTP 502', $e->getMessage());
        }

        Http::assertSentCount(3);
        $this->assertSame('failed', SyncLog::sole()->status);
        $this->assertStringContainsString('HTTP 502', SyncLog::sole()->error);
        $this->assertSame(0, Player::count());
    }

    public function test_an_api_error_message_is_reported(): void
    {
        Http::fake(fn () => Http::response($this->apiBody([], errors: ['plan' => 'Free plans are limited to a maximum value of 3 for the Page parameter'])));

        $this->expectException(ApiFootballException::class);
        $this->expectExceptionMessage('maximum value of 3');
        app(ApiFootballService::class)->clubPlayers(501, 2024, 4);
    }

    public function test_a_rate_limited_job_goes_back_on_the_queue(): void
    {
        Http::fake(fn () => Http::response('', 429, ['Retry-After' => '37']));
        $job = (new SyncClubPlayersJob(501, 2024))->withFakeQueueInteractions();

        $job->handle(new ApiFootballImporter);

        $job->assertReleased(delay: 37);
        $this->assertSame('rate_limited', SyncLog::sole()->status);
        Http::assertSentCount(1);
    }

    public function test_the_per_minute_limit_is_kept_without_calling_the_api(): void
    {
        config(['football.requests_per_minute' => 2]);
        $this->fakeApi();
        $api = app(ApiFootballService::class);
        $api->clubs(900, 2024);
        $api->clubs(900, 2024);

        try {
            $api->clubs(900, 2024);
            $this->fail('Expected the limiter to stop the third request.');
        } catch (ApiRateLimitedException $e) {
            $this->assertGreaterThan(0, $e->retryAfter);
            $this->assertLessThanOrEqual(60, $e->retryAfter);
        }
        Http::assertSentCount(2);

        $this->travel(61)->seconds();
        $api->clubs(900, 2024);
        Http::assertSentCount(3);
    }

    public function test_a_used_up_daily_quota_is_remembered_until_it_resets(): void
    {
        Http::fake(fn () => Http::response($this->apiBody([]), 200, ['x-ratelimit-requests-remaining' => '0']));
        $api = app(ApiFootballService::class);
        $api->clubs(900, 2024);

        try {
            $api->clubs(900, 2024);
            $this->fail('Expected the daily quota to stop the request.');
        } catch (ApiRateLimitedException $e) {
            $this->assertStringContainsString('daily quota', $e->getMessage());
            $this->assertLessThanOrEqual(86400, $e->retryAfter);
        }
        Http::assertSentCount(1);

        $this->travelTo(now('UTC')->addDay()->startOfDay()->addMinute());
        $api->clubs(900, 2024);
        Http::assertSentCount(2);
    }

    public function test_only_the_allowed_number_of_pages_is_requested(): void
    {
        config(['football.max_pages' => 1]);
        $this->fakeApi();
        Queue::fake([SyncPlayerTransfersJob::class]);

        SyncClubPlayersJob::dispatchSync(501, 2024);

        $this->assertSame(2, Player::count());
        Http::assertSentCount(1);
    }

    public function test_transfer_history_is_only_imported_for_known_players(): void
    {
        $this->fakeApi();

        SyncPlayerTransfersJob::dispatchSync(999);

        $this->assertSame(0, PlayerCareer::count());
        Http::assertNothingSent();
    }

    public function test_the_command_queues_the_configured_leagues(): void
    {
        Queue::fake();
        config(['football.leagues' => [39, 140], 'football.season' => 2024]);

        $this->artisan('football:sync')->assertSuccessful();
        Queue::assertPushed(SyncLeagueJob::class, 2);
        Queue::assertPushed(fn (SyncLeagueJob $job) => $job->league === 140 && $job->season === 2024 && ! $job->withTransfers);

        $this->artisan('football:sync', ['--league' => [61], '--season' => 2023, '--transfers' => true])->assertSuccessful();
        Queue::assertPushed(fn (SyncLeagueJob $job) => $job->league === 61 && $job->season === 2023 && $job->withTransfers);

        // the running season, so a new season refreshes the catalogue without editing the env
        \Illuminate\Support\Carbon::setTestNow('2026-03-01');
        $this->artisan('football:sync', ['--league' => [39], '--current' => true])->assertSuccessful();
        Queue::assertPushed(fn (SyncLeagueJob $job) => $job->league === 39 && $job->season === 2025);
        $this->artisan('football:sync', ['--league' => [39], '--current' => true, '--season' => 2021])->assertSuccessful();
        Queue::assertPushed(fn (SyncLeagueJob $job) => $job->league === 39 && $job->season === 2021);
        \Illuminate\Support\Carbon::setTestNow();

        config(['football.key' => null]);
        $this->artisan('football:sync')->assertFailed();
    }
}
