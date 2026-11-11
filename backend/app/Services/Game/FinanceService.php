<?php

namespace App\Services\Game;

use App\Exceptions\GameRuleException;
use App\Models\GameClub;
use App\Models\GameFinanceTransaction;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/** The only place that changes a club's balance. Every change leaves a ledger line. */
class FinanceService
{
    /**
     * Add (positive) or take (negative) money. The club row is locked for the rest of the
     * surrounding transaction. With $fromTransferBudget the transfer budget moves along.
     *
     * @throws GameRuleException insufficient_funds / insufficient_budget
     */
    public function record(GameClub $club, int $amount, string $type, string $description, ?Model $reference = null, bool $fromTransferBudget = false): ?GameFinanceTransaction
    {
        if ($amount === 0) {
            return null;
        }

        return DB::transaction(function () use ($club, $amount, $type, $description, $reference, $fromTransferBudget) {
            $locked = GameClub::whereKey($club->id)->lockForUpdate()->firstOrFail();
            if ($locked->balance + $amount < 0) {
                throw new GameRuleException('insufficient_funds', "{$locked->name} cannot afford this: balance {$locked->balance}, needed ".abs($amount).'.');
            }
            if ($fromTransferBudget && $locked->transfer_budget + $amount < 0) {
                throw new GameRuleException('insufficient_budget', "{$locked->name} has only {$locked->transfer_budget} left in its transfer budget.");
            }
            $locked->balance += $amount;
            if ($fromTransferBudget) {
                $locked->transfer_budget += $amount;
            }
            $locked->save();
            $club->setRawAttributes($locked->getAttributes(), true);

            return GameFinanceTransaction::create([
                'game_save_id' => $locked->game_save_id, 'game_club_id' => $locked->id, 'type' => $type, 'amount' => $amount,
                'balance_after' => $locked->balance, 'description' => $description,
                'reference_type' => $reference?->getMorphClass(), 'reference_id' => $reference?->getKey(),
                'game_date' => DB::table('game_saves')->where('id', $locked->game_save_id)->value('game_date'),
            ]);
        });
    }
}
