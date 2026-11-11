<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A completed move of a player between clubs. Rows are only ever added. */
class GameTransfer extends Model
{
    public const LOAN_RETURN = 'loan_return';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['game_date' => 'date'];
    }

    public function gamePlayer(): BelongsTo
    {
        return $this->belongsTo(GamePlayer::class);
    }

    public function fromClub(): BelongsTo
    {
        return $this->belongsTo(GameClub::class, 'from_club_id');
    }

    public function toClub(): BelongsTo
    {
        return $this->belongsTo(GameClub::class, 'to_club_id');
    }

    public function offer(): BelongsTo
    {
        return $this->belongsTo(GameTransferOffer::class, 'game_transfer_offer_id');
    }
}
