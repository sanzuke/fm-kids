<?php

namespace App\Models;

use App\Enums\PlayerOrigin;
use App\Enums\Position;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * A catalogue player, real or fictional. Shared by every game save and never changed by play.
 */
class Player extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'origin' => PlayerOrigin::class,
            'primary_position' => Position::class,
            'secondary_positions' => 'array',
            'base_attributes' => 'array',
            'birth_date' => 'date',
        ];
    }

    public function country(): BelongsTo
    {
        return $this->belongsTo(Country::class);
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(Club::class);
    }

    public function externalIds(): HasMany
    {
        return $this->hasMany(PlayerExternalId::class);
    }

    public function careers(): HasMany
    {
        return $this->hasMany(PlayerCareer::class);
    }

    public function photos(): HasMany
    {
        return $this->hasMany(PlayerPhoto::class);
    }

    public function gamePlayers(): HasMany
    {
        return $this->hasMany(GamePlayer::class);
    }

    public function ageOn(Carbon|string|null $date = null): int
    {
        return (int) $this->birth_date->diffInYears(Carbon::parse($date ?? now()));
    }

    /**
     * Catalogue filters shared by the player list and the transfer market.
     * Ages are measured on $on. Unknown keys are ignored.
     *
     * @param  array<string, mixed>  $filters
     */
    public function scopeFilter(Builder $query, array $filters, Carbon|string|null $on = null): void
    {
        $on = Carbon::parse($on ?? now())->startOfDay();
        $table = $this->getTable();

        $query
            ->when($filters['search'] ?? null, fn (Builder $q, $v) => $q->whereRaw("lower($table.name) LIKE ?", ['%'.mb_strtolower($v).'%']))
            ->when($filters['position'] ?? null, fn (Builder $q, $v) => $q->where(fn (Builder $w) => $w
                ->where("$table.primary_position", $v)
                ->orWhereJsonContains("$table.secondary_positions", $v)))
            ->when($filters['origin'] ?? null, fn (Builder $q, $v) => $q->where("$table.origin", $v))
            ->when($filters['nationality'] ?? null, fn (Builder $q, $v) => $q->whereHas('country', fn (Builder $c) => $c
                ->where('code', strtoupper($v))->orWhereRaw('lower(name) = ?', [mb_strtolower($v)])))
            // someone is at least N years old when born on or before (date - N years)
            ->when($filters['min_age'] ?? null, fn (Builder $q, $v) => $q->whereDate("$table.birth_date", '<=', $on->copy()->subYears((int) $v)))
            ->when($filters['max_age'] ?? null, fn (Builder $q, $v) => $q->whereDate("$table.birth_date", '>', $on->copy()->subYears((int) $v + 1)));
    }
}
