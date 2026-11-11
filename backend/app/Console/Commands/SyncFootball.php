<?php

namespace App\Console\Commands;

use App\Jobs\SyncLeagueJob;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SyncFootball extends Command
{
    protected $signature = 'football:sync
        {--league=* : API-Football league ids; defaults to API_FOOTBALL_LEAGUES}
        {--season= : season starting year; defaults to API_FOOTBALL_SEASON}
        {--current : use the season running today instead of API_FOOTBALL_SEASON}
        {--transfers : also fetch every player\'s transfer history (one more request per player)}';

    protected $description = 'Queue a synchronisation of real leagues, clubs and players from API-Football';

    public function handle(): int
    {
        if (! config('football.key')) {
            $this->error('API_FOOTBALL_TOKEN is not set.');

            return self::FAILURE;
        }
        $leagues = array_map('intval', $this->option('league')) ?: config('football.leagues');
        $season = $this->season();

        foreach ($leagues as $league) {
            SyncLeagueJob::dispatch($league, $season, (bool) $this->option('transfers'));
            $this->info("Queued league $league, season $season.");
        }
        $this->line('Run a queue worker to process it: php artisan queue:work');

        return self::SUCCESS;
    }

    /**
     * The season a sync should describe. A new season starts in July in Europe, and API-Football
     * names a season by its starting year, so "current" keeps the catalogue moving from one
     * season to the next without editing the environment every summer.
     */
    private function season(): int
    {
        if (! $this->option('current')) {
            return (int) ($this->option('season') ?: config('football.season'));
        }
        $today = Carbon::today();

        return (int) ($this->option('season') ?: ($today->month >= 7 ? $today->year : $today->year - 1));
    }
}
