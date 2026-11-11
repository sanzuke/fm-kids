<?php

namespace App\Jobs;

use App\Models\Club;
use App\Services\Football\ApiFootballImporter;
use App\Services\Football\ApiFootballService;

/** Imports one page of a club's players and queues the next page while there is one. */
class SyncClubPlayersJob extends SyncJob
{
    public function __construct(public int $club, public int $season, public int $page = 1, public bool $withTransfers = false) {}

    protected function resource(): string
    {
        return 'club_players';
    }

    protected function params(): array
    {
        return ['club' => $this->club, 'season' => $this->season, 'page' => $this->page];
    }

    protected function sync(ApiFootballImporter $importer): void
    {
        $result = app(ApiFootballService::class)->clubPlayers($this->club, $this->season, $this->page);
        $club = Club::where(['provider' => config('football.provider'), 'external_id' => (string) $this->club])->first();

        foreach ($result['players'] as $entry) {
            $importer->importPlayer($entry, $club);
            if ($this->withTransfers) {
                SyncPlayerTransfersJob::dispatch((int) $entry['player']['id']);
            }
        }
        if ($this->page < min($result['pages'], config('football.max_pages'))) {
            self::dispatch($this->club, $this->season, $this->page + 1, $this->withTransfers);
        }
    }
}
