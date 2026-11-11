<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * An offer for a player and the terms now on the table. While it is pending, "awaiting"
 * names the side that has to answer; each answer is also kept as a negotiation step.
 */
class GameTransferOffer extends Model
{
    public const TRANSFER = 'transfer';

    public const LOAN = 'loan';

    public const FREE_AGENT = 'free_agent';

    public const PENDING = 'pending';

    public const COMPLETED = 'completed';

    public const REJECTED = 'rejected';

    public const WITHDRAWN = 'withdrawn';

    public const BUYER = 'buyer';

    public const SELLER = 'seller';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['player_agreed' => 'boolean', 'loan_ends_on' => 'date', 'offered_on' => 'date', 'closed_on' => 'date'];
    }

    public function gameSave(): BelongsTo
    {
        return $this->belongsTo(GameSave::class);
    }

    public function gamePlayer(): BelongsTo
    {
        return $this->belongsTo(GamePlayer::class);
    }

    public function buyingClub(): BelongsTo
    {
        return $this->belongsTo(GameClub::class, 'buying_club_id');
    }

    public function sellingClub(): BelongsTo
    {
        return $this->belongsTo(GameClub::class, 'selling_club_id');
    }

    public function listing(): BelongsTo
    {
        return $this->belongsTo(GameTransferListing::class, 'game_transfer_listing_id');
    }

    public function negotiations(): HasMany
    {
        return $this->hasMany(GameTransferNegotiation::class)->orderBy('step');
    }

    public function transfer(): HasOne
    {
        return $this->hasOne(GameTransfer::class);
    }

    public function isPending(): bool
    {
        return $this->status === self::PENDING;
    }

    /** Which side of this offer a club is on, or null when it is not part of it. */
    public function sideOf(GameClub $club): ?string
    {
        return match ($club->id) {
            $this->buying_club_id => self::BUYER,
            $this->selling_club_id => self::SELLER,
            default => null,
        };
    }
}
