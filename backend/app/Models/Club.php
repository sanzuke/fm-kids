<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Club extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['is_fictional' => 'boolean'];
    }

    public function league(): BelongsTo
    {
        return $this->belongsTo(League::class);
    }

    public function country(): BelongsTo
    {
        return $this->belongsTo(Country::class);
    }

    public function players(): HasMany
    {
        return $this->hasMany(Player::class);
    }
}
