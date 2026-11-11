<?php

namespace App\Http\Resources;

use App\Models\GameSave;
use App\Services\Transfers\TransferMarketService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin GameSave */
class GameSaveResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $club = $this->userClub;
        $window = app(TransferMarketService::class)->currentWindow($this->resource);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'mode' => $this->is_cloud ? 'cloud' : 'structured',
            'season' => $this->season,
            'game_date' => $this->game_date->toDateString(),
            'club' => $club ? [
                'id' => $club->id, 'club_id' => $club->club_id, 'name' => $club->name, 'balance' => $club->balance,
                'transfer_budget' => $club->transfer_budget, 'wage_budget' => $club->wage_budget, 'wage_bill' => $club->wageBill(),
            ] : ($this->is_cloud ? ['id' => null, 'club_id' => null, 'name' => $this->world_club, 'balance' => null, 'transfer_budget' => null, 'wage_budget' => null, 'wage_bill' => null] : null),
            'transfer_window' => $window ? ['name' => $window->name, 'closes_on' => $window->closes_on->toDateString()] : null,
            'world' => $this->is_cloud ? ['version' => $this->world_version, 'players' => $this->world_players] : null,
            'created_at' => $this->created_at->toIso8601String(),
            'updated_at' => $this->updated_at->toIso8601String(),
        ];
    }
}
