<?php

namespace App\Http\Resources;

use App\Models\GameTransferListing;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin GameTransferListing */
class TransferListingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'status' => $this->status,
            'asking_price' => $this->asking_price,
            'listed_on' => $this->listed_on->toDateString(),
            'player' => ['id' => $this->game_player_id, 'name' => $this->gamePlayer->player->name],
            'club' => ['id' => $this->game_club_id, 'name' => $this->club->name],
            // bids that computer clubs made when the player went on the market
            'offers' => TransferOfferResource::collection($this->offers),
        ];
    }
}
