<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class League extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['is_fictional' => 'boolean'];
    }

    public function country(): BelongsTo
    {
        return $this->belongsTo(Country::class);
    }

    public function clubs(): HasMany
    {
        return $this->hasMany(Club::class);
    }
}
