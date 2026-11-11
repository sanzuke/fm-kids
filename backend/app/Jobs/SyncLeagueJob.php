<?php

namespace App\Jobs;

use App\Services\Football\ApiFootballImporter;
use App\Services\Football\ApiFootballService;

/** Imports a league and its clubs, then queues one player sync per club. */
class SyncLeagueJob extends SyncJob
{
    public function __construct(public int $league, public int $season, public bool $withTransfers = false) {}

    protected function resource(): string
    {
        return 'league';
    }

    protected function params(): array
    {
        return ['league' => $this->league, 'season' => $this->season];
    }

    protected function sync(ApiFootballImporter $importer): void
    {
        $api = app(ApiFootballService::class);
        $record = $api->leagues(['id' => $this->league])[0] ?? null;
        $league = $record ? $importer->importLeague($record) : null;

        foreach ($api->clubs($this->league, $this->season) as $item) {
            $importer->importClub($item, $league);
            SyncClubPlayersJob::dispatch((int) $item['team']['id'], $this->season, 1, $this->withTransfers);
        }
    }
}
