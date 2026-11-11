<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A player's ratings, value and condition in one game save. */
class GamePlayerAttribute extends Model
{
    public const SKILLS = ['speed', 'shooting', 'passing', 'dribbling', 'defending', 'stamina'];

    protected $guarded = ['id'];

    public function gamePlayer(): BelongsTo
    {
        return $this->belongsTo(GamePlayer::class);
    }

    /** @return array<string, int> */
    public function skills(): array
    {
        return $this->only(self::SKILLS);
    }
}
