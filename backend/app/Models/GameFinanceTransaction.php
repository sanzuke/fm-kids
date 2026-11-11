<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/** One line of a club's ledger. Rows are only ever added. */
class GameFinanceTransaction extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['game_date' => 'date'];
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(GameClub::class, 'game_club_id');
    }

    public function reference(): MorphTo
    {
        return $this->morphTo();
    }
}
