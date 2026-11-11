<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A catalogue player. @mixin \App\Models\Player */
class PlayerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'origin' => $this->origin->value,
            'age' => $this->ageOn(),
            'birth_date' => $this->birth_date->toDateString(),
            'nationality' => $this->country ? ['code' => $this->country->code, 'name' => $this->country->name] : null,
            'club' => $this->club ? ['id' => $this->club->id, 'name' => $this->club->name] : null,
            'position' => $this->primary_position->value,
            'secondary_positions' => $this->secondary_positions,
            'preferred_foot' => $this->preferred_foot,
            'personality' => $this->personality,
            'height_cm' => $this->height_cm,
            'overall' => $this->base_overall,
            'potential' => $this->base_potential,
            'attributes' => $this->base_attributes,
            'market_value' => $this->base_market_value,
            'wage' => $this->base_wage,
            'photo' => $this->whenLoaded('photos', fn () => $this->photos->sortByDesc('is_primary')->first()?->url),
            'external_ids' => $this->whenLoaded('externalIds', fn () => $this->externalIds->map(fn ($e) => ['provider' => $e->provider, 'id' => $e->external_id])),
            'career' => $this->whenLoaded('careers', fn () => $this->careers->map(fn ($c) => array_filter([
                'kind' => $c->kind, 'season' => $c->season, 'club' => $c->club_name, 'from_club' => $c->from_club_name, 'league' => $c->league_name,
                'appearances' => $c->kind === 'season' ? $c->appearances : null, 'minutes' => $c->kind === 'season' ? $c->minutes : null,
                'goals' => $c->kind === 'season' ? $c->goals : null, 'assists' => $c->kind === 'season' ? $c->assists : null,
                'rating' => $c->rating, 'date' => $c->transfer_date?->toDateString(), 'transfer_type' => $c->transfer_type,
            ], fn ($v) => $v !== null))->values()),
        ];
    }
}
