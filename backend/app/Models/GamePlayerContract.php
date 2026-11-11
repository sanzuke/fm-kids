<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GamePlayerContract extends Model
{
    public const ACTIVE = 'active';

    public const EXPIRED = 'expired';

    public const TERMINATED = 'terminated';

    public const TRANSFERRED = 'transferred';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['starts_on' => 'date', 'ends_on' => 'date', 'ended_on' => 'date'];
    }

    public function gamePlayer(): BelongsTo
    {
        return $this->belongsTo(GamePlayer::class);
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(GameClub::class, 'game_club_id');
    }
}
