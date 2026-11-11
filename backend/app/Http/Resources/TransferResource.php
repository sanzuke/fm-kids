<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A completed move. @mixin \App\Models\GameTransfer */
class TransferResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'fee' => $this->fee,
            'wage' => $this->wage,
            'season' => $this->season,
            'date' => $this->game_date->toDateString(),
            'player' => ['id' => $this->game_player_id, 'name' => $this->gamePlayer->player->name, 'origin' => $this->gamePlayer->player->origin->value],
            'from_club' => $this->fromClub ? ['id' => $this->from_club_id, 'name' => $this->fromClub->name] : null,
            'to_club' => ['id' => $this->to_club_id, 'name' => $this->toClub->name],
            'offer_id' => $this->game_transfer_offer_id,
        ];
    }
}
