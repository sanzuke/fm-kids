<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A player playing for another club until a date; the contract stays with the parent club. */
class GameLoanAgreement extends Model
{
    public const ACTIVE = 'active';

    public const COMPLETED = 'completed';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['starts_on' => 'date', 'ends_on' => 'date'];
    }

    public function gamePlayer(): BelongsTo
    {
        return $this->belongsTo(GamePlayer::class);
    }

    public function parentClub(): BelongsTo
    {
        return $this->belongsTo(GameClub::class, 'parent_club_id');
    }

    public function loanClub(): BelongsTo
    {
        return $this->belongsTo(GameClub::class, 'loan_club_id');
    }
}
