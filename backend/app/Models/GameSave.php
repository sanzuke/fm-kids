<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/** One independent playthrough: its own clubs, players, contracts, money and transfer market. */
class GameSave extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'game_date' => 'date',
            // a cloud save carries the game's whole world document; structured saves leave it null
            'world' => 'array',
            'is_cloud' => 'boolean',
        ];
    }

    /** True for a save that stores the game's own world document instead of structured tables. */
    public function isCloud(): bool
    {
        return $this->is_cloud;
    }

    /** Columns a save list needs; the world document itself is left out to keep the list small. */
    public const SUMMARY_COLUMNS = [
        'id', 'user_id', 'name', 'season', 'game_date', 'seed', 'user_game_club_id',
        'world_version', 'world_players', 'world_club', 'is_cloud', 'created_at', 'updated_at',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function userClub(): BelongsTo
    {
        return $this->belongsTo(GameClub::class, 'user_game_club_id');
    }

    public function clubs(): HasMany
    {
        return $this->hasMany(GameClub::class);
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

    public function transferWindows(): HasMany
    {
        return $this->hasMany(GameTransferWindow::class);
    }

    public function transferListings(): HasMany
    {
        return $this->hasMany(GameTransferListing::class);
    }

    public function transferOffers(): HasMany
    {
        return $this->hasMany(GameTransferOffer::class);
    }

    public function transfers(): HasMany
    {
        return $this->hasMany(GameTransfer::class);
    }

    /** The season (its starting year) a date falls in. */
    public static function seasonOf(Carbon $date): int
    {
        return $date->format('m-d') >= config('game.season_start') ? $date->year : $date->year - 1;
    }

    /** Last day of the season that is running on $date. */
    public static function seasonEnd(Carbon $date): Carbon
    {
        return Carbon::parse((self::seasonOf($date) + 1).'-'.config('game.season_start'))->subDay();
    }
}
