<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One line of a player's real-world history: a season's statistics or a transfer. */
class PlayerCareer extends Model
{
    public const KIND_SEASON = 'season';

    public const KIND_TRANSFER = 'transfer';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['transfer_date' => 'date', 'rating' => 'float'];
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(Club::class);
    }

    public function fromClub(): BelongsTo
    {
        return $this->belongsTo(Club::class, 'from_club_id');
    }
}
