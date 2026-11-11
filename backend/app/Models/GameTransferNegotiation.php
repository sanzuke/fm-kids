<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One thing said in a negotiation: an offer, a counter, an acceptance or a refusal. */
class GameTransferNegotiation extends Model
{
    protected $guarded = ['id'];

    public function offer(): BelongsTo
    {
        return $this->belongsTo(GameTransferOffer::class, 'game_transfer_offer_id');
    }
}
