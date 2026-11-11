<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlayerExternalId extends Model
{
    protected $guarded = ['id'];

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }
}
