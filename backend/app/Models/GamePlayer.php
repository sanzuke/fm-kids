<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A catalogue player as they are in one game save. Real and fictional players share this
 * structure; everything that play changes hangs off this row, not off the catalogue player.
 */
class GamePlayer extends Model
{
    protected $guarded = ['id'];

    public function gameSave(): BelongsTo
    {
        return $this->belongsTo(GameSave::class, 'game_save_id');
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(GameClub::class, 'game_club_id');
    }

    public function ratings(): HasOne
    {
        return $this->hasOne(GamePlayerAttribute::class);
    }

    public function development(): HasMany
    {
        return $this->hasMany(GamePlayerDevelopment::class);
    }

    public function contracts(): HasMany
    {
        return $this->hasMany(GamePlayerContract::class);
    }

    public function activeContract(): HasOne
    {
        return $this->hasOne(GamePlayerContract::class)->where('status', GamePlayerContract::ACTIVE);
    }

    public function activeListing(): HasOne
    {
        return $this->hasOne(GameTransferListing::class)->where('status', GameTransferListing::ACTIVE);
    }

    public function activeLoan(): HasOne
    {
        return $this->hasOne(GameLoanAgreement::class)->where('status', GameLoanAgreement::ACTIVE);
    }

    public function offers(): HasMany
    {
        return $this->hasMany(GameTransferOffer::class);
    }

    public function isFreeAgent(): bool
    {
        return $this->game_club_id === null;
    }
}
