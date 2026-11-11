<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A player as they are in one game save. @mixin \App\Models\GamePlayer */
class GamePlayerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $p = $this->player;
        $a = $this->ratings;

        return [
            'id' => $this->id,
            'player_id' => $this->player_id,
            'name' => $p->name,
            'origin' => $p->origin->value,
            'age' => $p->ageOn($this->gameSave->game_date),
            'nationality' => $p->country ? ['code' => $p->country->code, 'name' => $p->country->name] : null,
            'position' => $p->primary_position->value,
            'secondary_positions' => $p->secondary_positions,
            'preferred_foot' => $p->preferred_foot,
            'club' => $this->club ? ['id' => $this->club->id, 'name' => $this->club->name] : null,
            'is_free_agent' => $this->game_club_id === null,
            'squad_number' => $this->squad_number,
            'overall' => $a->overall,
            'potential' => $a->potential,
            'attributes' => $a->skills(),
            'market_value' => $a->market_value,
            'wage_expectation' => $a->wage_expectation,
            'contract' => $this->whenLoaded('activeContract', fn () => $this->activeContract
                ? ['wage' => $this->activeContract->wage, 'ends_on' => $this->activeContract->ends_on->toDateString()] : null),
            'listing' => $this->whenLoaded('activeListing', fn () => $this->activeListing
                ? ['id' => $this->activeListing->id, 'type' => $this->activeListing->type, 'asking_price' => $this->activeListing->asking_price] : null),
            'on_loan' => $this->whenLoaded('activeLoan', fn () => $this->activeLoan
                ? ['parent_club_id' => $this->activeLoan->parent_club_id, 'ends_on' => $this->activeLoan->ends_on->toDateString()] : null),
            // listing price, or market value when the player is not listed (set by the market queries)
            'price' => $this->when(isset($this->resource->getAttributes()['price']), fn () => (int) $this->resource->getAttributes()['price']),
        ];
    }
}
