<?php

namespace App\Services\Transfers;

use App\Models\GameClub;
use App\Models\GamePlayer;
use App\Models\GameTransferListing;
use App\Models\GameTransferOffer;
use Illuminate\Support\Collection;

/**
 * Decides for the computer-run side of a negotiation: selling clubs, buying clubs and the
 * players themselves. It only answers; TransferService applies the answer. The rules are
 * fixed (no dice), so the same offer always gets the same answer.
 */
class TransferNegotiator
{
    /** @var array<string, mixed> */
    private array $rules;

    public function __construct()
    {
        $this->rules = config('game.negotiation');
    }

    /** What a club wants for the player: the listing price, or a premium on market value when not listed. */
    public function askingPrice(GamePlayer $player, string $type): int
    {
        $listing = $player->activeListing;
        if ($listing && $listing->type === $type) {
            return (int) $listing->asking_price;
        }
        $value = $player->ratings->market_value;

        return (int) ceil($type === GameTransferOffer::LOAN ? $value * $this->rules['loan_fee_share'] : $value * $this->rules['unlisted_premium']);
    }

    /**
     * A selling club's answer to the fee on the table.
     *
     * @param  int|null  $ownLastFee  the fee this club itself proposed last, which it will still take
     * @return array{action: 'accept'|'counter'|'reject', fee?: int, note?: string}
     */
    public function sellerClubAnswer(GameTransferOffer $offer, GamePlayer $player, int $sellerSquadSize, ?int $ownLastFee = null): array
    {
        if ($sellerSquadSize <= config('game.squad.min')) {
            return ['action' => 'reject', 'note' => 'The club cannot spare any player right now.'];
        }
        $asking = $this->askingPrice($player, $offer->type);
        $acceptable = min($asking, $ownLastFee ?? $asking);
        if ($offer->fee >= $acceptable) {
            return ['action' => 'accept'];
        }
        if ($offer->fee < $asking * $this->rules['seller_counter_from']) {
            return ['action' => 'reject', 'note' => 'The offer is far below what the club wants.'];
        }
        if ($offer->rounds >= $this->rules['max_rounds']) {
            return ['action' => 'reject', 'note' => 'The clubs could not agree on a fee.'];
        }

        // meet in the middle, but never go back above an earlier counter
        return ['action' => 'counter', 'fee' => min($acceptable, (int) ceil(($offer->fee + $asking) / 2)), 'note' => 'The club wants more for this player.'];
    }

    /**
     * The player's answer to the wage on the table (loans keep the parent club's contract, so they always agree).
     *
     * @return array{action: 'accept'|'counter'|'reject', wage?: int, note?: string}
     */
    public function playerAnswer(GameTransferOffer $offer, GamePlayer $player): array
    {
        if ($offer->type === GameTransferOffer::LOAN) {
            return ['action' => 'accept'];
        }
        $expected = (int) $player->ratings->wage_expectation;
        if ($offer->wage >= ceil($expected * $this->rules['wage_accept_from'])) {
            return ['action' => 'accept'];
        }
        if ($offer->wage < $expected * $this->rules['wage_counter_from'] || $offer->rounds >= $this->rules['max_rounds']) {
            return ['action' => 'reject', 'note' => 'The player turned down the wage.'];
        }

        return ['action' => 'counter', 'wage' => $expected, 'note' => 'The player asks for a better wage.'];
    }

    /**
     * A buying club's answer to the fee the seller asks.
     *
     * @param  int  $ownLastFee  what this club bid last
     * @return array{action: 'accept'|'counter'|'reject', fee?: int, note?: string}
     */
    public function buyerClubAnswer(GameTransferOffer $offer, GamePlayer $player, GameClub $buyer, int $ownLastFee): array
    {
        $limit = min($this->buyerLimit($player, $offer->type), (int) $buyer->transfer_budget, (int) $buyer->balance);
        if ($offer->fee <= max($limit, $ownLastFee)) {
            return ['action' => 'accept'];
        }
        if ($offer->rounds >= $this->rules['max_rounds'] || $ownLastFee >= $limit) {
            return ['action' => 'reject', 'note' => 'The asking price is too high for the club.'];
        }

        return ['action' => 'counter', 'fee' => min($limit, (int) ceil(($ownLastFee + $offer->fee) / 2)), 'note' => 'The club raised its bid.'];
    }

    /**
     * Computer clubs that bid for a newly listed player, best reputation first.
     *
     * @return Collection<int, array{club: GameClub, fee: int}>
     */
    public function listingBids(GameTransferListing $listing, GamePlayer $player): Collection
    {
        $limit = $this->buyerLimit($player, $listing->type);
        $fee = min($limit, (int) ceil($listing->asking_price * $this->rules['listing_bid_share']));
        // nobody bids for a player priced far beyond their worth
        if ($listing->asking_price > $limit * 1.5) {
            return collect();
        }

        return GameClub::where('game_save_id', $listing->game_save_id)
            ->where('is_user_controlled', false)->where('id', '!=', $listing->game_club_id)
            ->where('transfer_budget', '>=', $fee)->where('balance', '>=', $fee)
            ->has('players', '<', config('game.squad.max'))
            ->whereDoesntHave('players', fn ($q) => $q->whereKey($player->id))
            ->orderByDesc('reputation')->orderBy('id')
            ->take($this->rules['listing_bidders'])->get()
            ->map(fn (GameClub $club) => ['club' => $club, 'fee' => $fee]);
    }

    /** The most a computer club pays for the player. */
    private function buyerLimit(GamePlayer $player, string $type): int
    {
        $value = $player->ratings->market_value;
        $worth = $type === GameTransferOffer::LOAN ? $value * $this->rules['loan_fee_share'] : $value;

        return (int) ceil($worth * $this->rules['buyer_max_premium']);
    }
}
