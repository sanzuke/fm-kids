<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A club inside one game save, with that save's money. */
class GameClub extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['is_user_controlled' => 'boolean'];
    }

    public function gameSave(): BelongsTo
    {
        return $this->belongsTo(GameSave::class, 'game_save_id');
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(Club::class);
    }

    public function players(): HasMany
    {
        return $this->hasMany(GamePlayer::class);
    }

    public function contracts(): HasMany
    {
        return $this->hasMany(GamePlayerContract::class);
    }

    public function financeTransactions(): HasMany
    {
        return $this->hasMany(GameFinanceTransaction::class);
    }

    /** Wages of all running contracts. */
    public function wageBill(): int
    {
        return (int) $this->contracts()->where('status', GamePlayerContract::ACTIVE)->sum('wage');
    }
}
