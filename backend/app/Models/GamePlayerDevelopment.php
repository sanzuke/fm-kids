<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One step of a player's progression in a game save. */
class GamePlayerDevelopment extends Model
{
    protected $table = 'game_player_development';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['changes' => 'array', 'game_date' => 'date'];
    }

    public function gamePlayer(): BelongsTo
    {
        return $this->belongsTo(GamePlayer::class);
    }
}
