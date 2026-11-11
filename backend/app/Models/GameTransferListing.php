<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A club putting one of its players on the market, for sale or for loan. */
class GameTransferListing extends Model
{
    public const ACTIVE = 'active';

    public const SOLD = 'sold';

    public const WITHDRAWN = 'withdrawn';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['listed_on' => 'date', 'closed_on' => 'date'];
    }

    public function gamePlayer(): BelongsTo
    {
        return $this->belongsTo(GamePlayer::class);
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(GameClub::class, 'game_club_id');
    }

    public function offers(): HasMany
    {
        return $this->hasMany(GameTransferOffer::class);
    }
}
