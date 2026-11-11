<?php

namespace App\Jobs;

use App\Models\PlayerExternalId;
use App\Services\Football\ApiFootballImporter;
use App\Services\Football\ApiFootballService;

/** Imports the transfer history of a player who is already in the catalogue. */
class SyncPlayerTransfersJob extends SyncJob
{
    public function __construct(public int $player) {}

    protected function resource(): string
    {
        return 'player_transfers';
    }

    protected function params(): array
    {
        return ['player' => $this->player];
    }

    protected function sync(ApiFootballImporter $importer): void
    {
        $link = PlayerExternalId::where(['provider' => config('football.provider'), 'external_id' => (string) $this->player])->first();
        if ($link) {
            $importer->importTransfers($link->player, app(ApiFootballService::class)->playerTransfers($this->player));
        }
    }
}
