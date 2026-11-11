<?php

namespace App\Services\Transfers;

use App\Exceptions\GameRuleException;
use App\Models\GameClub;
use App\Models\GameLoanAgreement;
use App\Models\GamePlayer;
use App\Models\GameSave;
use App\Models\GameTransfer;
use App\Models\GameTransferListing;
use App\Models\GameTransferOffer;
use App\Services\Game\ContractService;
use App\Services\Game\FinanceService;
use App\Services\Game\SquadService;
use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Listings, offers, negotiation and the completion of transfers, loans and free-agent signings.
 *
 * Every public method is one database transaction that first locks the player's row, so two
 * requests about the same player run one after the other and the second sees what the first did.
 * The computer-run side answers inside the same transaction (see TransferNegotiator).
 */
class TransferService
{
    public function __construct(
        private readonly FinanceService $finance,
        private readonly ContractService $contracts,
        private readonly SquadService $squads,
        private readonly TransferMarketService $market,
        private readonly TransferNegotiator $negotiator,
    ) {}

    /**
     * Put one of the club's players on the market. Computer clubs may bid straight away.
     *
     * @throws GameRuleException not_your_player / player_on_loan / already_listed
     */
    public function listPlayer(GameClub $seller, GamePlayer $player, int $askingPrice, string $type = GameTransferOffer::TRANSFER): GameTransferListing
    {
        return $this->withPlayerLocked($player, function (GamePlayer $player) use ($seller, $askingPrice, $type) {
            $this->assertOwnedBy($player, $seller);
            if ($player->activeListing()->exists()) {
                throw new GameRuleException('already_listed', 'This player is already on the market.', 409);
            }
            $save = $player->gameSave;
            $listing = GameTransferListing::create([
                'game_save_id' => $save->id, 'game_player_id' => $player->id, 'game_club_id' => $seller->id,
                'type' => $type, 'asking_price' => $askingPrice, 'status' => GameTransferListing::ACTIVE, 'listed_on' => $save->game_date,
            ]);
            $this->inviteBids($listing, $player);

            return $listing;
        });
    }

    /** Computer clubs bid for the user's listed players that have no open offer yet (used when a window opens). */
    public function inviteBidsForOpenListings(GameSave $save): void
    {
        $listings = GameTransferListing::where('game_save_id', $save->id)->where('status', GameTransferListing::ACTIVE)
            ->whereDoesntHave('offers', fn ($q) => $q->where('status', GameTransferOffer::PENDING))->get();
        foreach ($listings as $listing) {
            $this->withPlayerLocked($listing->gamePlayer, fn (GamePlayer $player) => $this->inviteBids($listing, $player));
        }
    }

    /**
     * Make an offer for a player. Terms: type (transfer | loan | free_agent), fee, wage,
     * contract_years, loan_ends_on. A computer-run seller or free agent answers at once, so the
     * returned offer may already be completed, countered or rejected.
     *
     * @param  array{type: string, fee?: int, wage?: int|null, contract_years?: int|null, loan_ends_on?: string|null}  $terms
     *
     * @throws GameRuleException
     */
    public function makeOffer(GameClub $buyer, GamePlayer $player, array $terms): GameTransferOffer
    {
        return $this->withPlayerLocked($player, function (GamePlayer $player) use ($buyer, $terms) {
            $save = $player->gameSave;
            $type = $terms['type'];
            $fee = $type === GameTransferOffer::FREE_AGENT ? 0 : (int) ($terms['fee'] ?? 0);

            if ($buyer->game_save_id !== $player->game_save_id) {
                throw new GameRuleException('wrong_save', 'That player belongs to another game save.', 404);
            }
            if ($player->game_club_id === $buyer->id) {
                throw new GameRuleException('already_yours', 'This player is already at your club.');
            }
            if ($player->isFreeAgent() !== ($type === GameTransferOffer::FREE_AGENT)) {
                throw $player->isFreeAgent()
                    ? new GameRuleException('player_is_free_agent', 'This player has no club: sign them as a free agent.')
                    : new GameRuleException('not_a_free_agent', 'This player is under contract at a club.');
            }
            $this->assertCanMove($save, $player, $type, $terms['loan_ends_on'] ?? null);
            $this->assertAffordable($buyer, $fee);
            if (GameTransferOffer::where(['game_player_id' => $player->id, 'buying_club_id' => $buyer->id, 'status' => GameTransferOffer::PENDING])->exists()) {
                throw new GameRuleException('duplicate_offer', 'You already have an open offer for this player. Answer or withdraw it first.', 409);
            }

            $offer = $this->createOffer($save, $buyer, $player, $type, $fee, $terms);
            $this->answerAsComputer($offer, $player);

            return $offer;
        });
    }

    /**
     * Agree to the terms on the table. Completes the deal unless the player still has to agree
     * and asks for a better wage.
     *
     * @throws GameRuleException offer_closed / not_your_offer / not_your_turn, and the completion checks
     */
    public function accept(GameTransferOffer $offer, GameClub $actor): GameTransferOffer
    {
        return $this->withOfferLocked($offer, function (GameTransferOffer $offer, GamePlayer $player) use ($actor) {
            $side = $this->turnOf($offer, $actor);
            $this->say($offer, $side, 'accept');
            $this->settle($offer, $player);

            return $offer;
        });
    }

    /** Turn the offer down (as the seller) or withdraw it (as the buyer). */
    public function reject(GameTransferOffer $offer, GameClub $actor, ?string $note = null): GameTransferOffer
    {
        return $this->withOfferLocked($offer, function (GameTransferOffer $offer) use ($actor, $note) {
            $side = $this->sideOf($offer, $actor);
            $this->say($offer, $side, 'reject', note: $note);
            $this->close($offer, $side === GameTransferOffer::BUYER ? GameTransferOffer::WITHDRAWN : GameTransferOffer::REJECTED, $note);

            return $offer;
        });
    }

    /**
     * Answer with other terms. A seller can change the fee; a buyer the fee, wage, contract
     * length and loan end. A computer-run other side answers at once.
     *
     * @param  array{fee?: int, wage?: int, contract_years?: int, loan_ends_on?: string}  $terms
     *
     * @throws GameRuleException offer_closed / not_your_offer / not_your_turn / invalid_counter
     */
    public function counter(GameTransferOffer $offer, GameClub $actor, array $terms): GameTransferOffer
    {
        return $this->withOfferLocked($offer, function (GameTransferOffer $offer, GamePlayer $player) use ($actor, $terms) {
            $side = $this->turnOf($offer, $actor);
            $terms = array_filter($terms, fn ($v) => $v !== null);
            $allowed = $side === GameTransferOffer::SELLER ? ['fee'] : match ($offer->type) {
                GameTransferOffer::FREE_AGENT => ['wage', 'contract_years'],
                GameTransferOffer::LOAN => ['fee', 'loan_ends_on'],
                default => ['fee', 'wage', 'contract_years'],
            };
            if ($terms === [] || array_diff(array_keys($terms), $allowed) !== []) {
                throw new GameRuleException('invalid_counter', 'Here you can only change: '.implode(', ', $allowed).'.');
            }

            if ($side === GameTransferOffer::BUYER) {
                $this->assertAffordable($actor, (int) ($terms['fee'] ?? $offer->fee));
                if (isset($terms['loan_ends_on'])) {
                    $this->assertCanMove($offer->gameSave, $player, $offer->type, $terms['loan_ends_on']);
                }
                // new personal terms have to be put to the player again
                if (isset($terms['wage']) || isset($terms['contract_years'])) {
                    $offer->player_agreed = false;
                }
            }
            $offer->fill($terms);
            $offer->awaiting = $side === GameTransferOffer::BUYER ? GameTransferOffer::SELLER : GameTransferOffer::BUYER;
            $offer->rounds++;
            $offer->save();
            $this->say($offer, $side, 'counter', $terms);
            $this->answerAsComputer($offer, $player);

            return $offer;
        });
    }

    // ---------- negotiation ----------

    /** Let the computer answer when the offer waits for a side the user does not control. */
    private function answerAsComputer(GameTransferOffer $offer, GamePlayer $player): void
    {
        if (! $offer->isPending()) {
            return;
        }
        if ($offer->awaiting === GameTransferOffer::SELLER) {
            $seller = $offer->sellingClub;
            if ($seller?->is_user_controlled) {
                return;
            }
            if ($seller) {
                $ownLast = $offer->negotiations()->where(['side' => 'seller', 'action' => 'counter'])->latest('step')->value('fee');
                $answer = $this->negotiator->sellerClubAnswer($offer, $player, $this->squads->size($seller), $ownLast);
                if ($answer['action'] === 'reject') {
                    $this->say($offer, 'seller', 'reject', note: $answer['note']);
                    $this->close($offer, GameTransferOffer::REJECTED, $answer['note']);

                    return;
                }
                if ($answer['action'] === 'counter') {
                    $offer->update(['fee' => $answer['fee'], 'awaiting' => GameTransferOffer::BUYER, 'rounds' => $offer->rounds + 1]);
                    $this->say($offer, 'seller', 'counter', ['fee' => $answer['fee']], $answer['note']);

                    return;
                }
                $this->say($offer, 'seller', 'accept');
            }
            $this->settle($offer, $player);

            return;
        }

        $buyer = $offer->buyingClub;
        if ($buyer->is_user_controlled) {
            return;
        }
        $ownLast = (int) $offer->negotiations()->where('side', 'buyer')->whereNotNull('fee')->latest('step')->value('fee');
        $answer = $this->negotiator->buyerClubAnswer($offer, $player, $buyer, $ownLast);
        if ($answer['action'] === 'reject') {
            $this->say($offer, 'buyer', 'reject', note: $answer['note']);
            $this->close($offer, GameTransferOffer::WITHDRAWN, $answer['note']);
        } elseif ($answer['action'] === 'counter') {
            $offer->update(['fee' => $answer['fee'], 'awaiting' => GameTransferOffer::SELLER, 'rounds' => $offer->rounds + 1]);
            $this->say($offer, 'buyer', 'counter', ['fee' => $answer['fee']], $answer['note']);
        } else {
            $this->say($offer, 'buyer', 'accept');
            $this->settle($offer, $player);
        }
    }

    /** The clubs agree. Ask the player if that is still open, then complete the deal. */
    private function settle(GameTransferOffer $offer, GamePlayer $player): void
    {
        if (! $offer->player_agreed) {
            $answer = $this->negotiator->playerAnswer($offer, $player);
            if ($answer['action'] === 'reject') {
                $this->say($offer, 'player', 'reject', note: $answer['note']);
                $this->close($offer, GameTransferOffer::REJECTED, $answer['note']);

                return;
            }
            if ($answer['action'] === 'counter') {
                // the player names their wage; the buyer can accept it or counter once more
                $offer->update(['wage' => $answer['wage'], 'player_agreed' => true, 'awaiting' => GameTransferOffer::BUYER, 'rounds' => $offer->rounds + 1]);
                $this->say($offer, 'player', 'counter', ['wage' => $answer['wage']], $answer['note']);

                return;
            }
            $offer->player_agreed = true;
            $this->say($offer, 'player', 'accept');
        }
        $this->complete($offer, $player);
    }

    // ---------- completion ----------

    /**
     * Carry out an agreed deal. Runs inside the caller's transaction with the player row locked;
     * any failed check throws and rolls everything back, so a deal is done completely or not at all.
     */
    private function complete(GameTransferOffer $offer, GamePlayer $player): GameTransfer
    {
        $save = $offer->gameSave;
        $isLoan = $offer->type === GameTransferOffer::LOAN;
        $isFreeAgent = $offer->type === GameTransferOffer::FREE_AGENT;

        // 1. the offer itself
        if (! $offer->isPending()) {
            throw new GameRuleException('offer_closed', 'This offer is no longer open.', 409);
        }
        // lock both clubs in id order, so two deals between the same clubs cannot block each other
        $clubs = GameClub::whereKey(array_filter([$offer->buying_club_id, $offer->selling_club_id]))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        $buyer = $clubs[$offer->buying_club_id];
        $seller = $offer->selling_club_id ? $clubs[$offer->selling_club_id] : null;

        // 2. the buying club's balance and budget
        $this->assertAffordable($buyer, (int) $offer->fee);
        if ($this->squads->size($buyer) >= config('game.squad.max')) {
            throw new GameRuleException('squad_full', "{$buyer->name} has no room in the squad.");
        }

        // 3. the player still belongs to the selling club (or is still a free agent)
        if ($player->game_club_id !== $offer->selling_club_id) {
            throw new GameRuleException('player_not_owned', 'The player is no longer at the club this offer was made to.', 409);
        }
        if ($seller && $this->squads->size($seller) <= config('game.squad.min')) {
            throw new GameRuleException('squad_too_small', "{$seller->name} would be left with too few players.");
        }

        // 4. window, loan and contract conditions
        $this->assertCanMove($save, $player, $offer->type, $offer->loan_ends_on?->toDateString());
        $contract = $player->activeContract()->lockForUpdate()->first();
        if (! $isFreeAgent && ! $contract) {
            throw new GameRuleException('no_contract', 'The player has no running contract to buy out.');
        }

        try {
            // 10. the completed transfer (unique per offer: a second completion cannot be stored)
            $transfer = DB::transaction(fn () => GameTransfer::create([
                'game_save_id' => $save->id, 'game_player_id' => $player->id, 'from_club_id' => $seller?->id, 'to_club_id' => $buyer->id,
                'game_transfer_offer_id' => $offer->id, 'game_transfer_window_id' => $this->market->currentWindow($save)?->id,
                'type' => $offer->type, 'fee' => $offer->fee, 'wage' => $isLoan ? $contract->wage : $offer->wage,
                'season' => $save->season, 'game_date' => $save->game_date,
            ]));
        } catch (UniqueConstraintViolationException) {
            throw new GameRuleException('offer_closed', 'This offer was already completed.', 409);
        }

        // 5, 6, 9. the fee leaves the buyer and reaches the seller, each with a ledger line
        $name = $player->player->name;
        $this->finance->record($buyer, -$offer->fee, $isLoan ? 'loan_fee_paid' : 'transfer_fee_paid', ($isLoan ? 'Loan fee for ' : 'Transfer fee for ').$name, $transfer, fromTransferBudget: true);
        if ($seller) {
            $this->finance->record($seller, (int) $offer->fee, $isLoan ? 'loan_fee_received' : 'transfer_fee_received', ($isLoan ? 'Loan fee for ' : 'Transfer fee for ').$name, $transfer, fromTransferBudget: true);
        }

        // 7. the player changes club
        $player->update(['game_club_id' => $buyer->id, 'squad_number' => null]);

        // 8. the contract: a new one at the buying club, or the old one stays with the parent club on loan
        if ($isLoan) {
            GameLoanAgreement::create([
                'game_save_id' => $save->id, 'game_player_id' => $player->id, 'parent_club_id' => $seller->id, 'loan_club_id' => $buyer->id,
                'game_transfer_id' => $transfer->id, 'fee' => $offer->fee, 'starts_on' => $save->game_date, 'ends_on' => $offer->loan_ends_on,
                'status' => GameLoanAgreement::ACTIVE,
            ]);
        } else {
            $this->contracts->sign($player, $buyer, (int) $offer->wage, (int) $offer->contract_years);
        }

        // 11. the listing is done, other open offers for the player fall away, this offer is completed
        GameTransferListing::where('game_player_id', $player->id)->where('status', GameTransferListing::ACTIVE)
            ->update(['status' => GameTransferListing::SOLD, 'closed_on' => $save->game_date]);
        GameTransferOffer::where('game_player_id', $player->id)->where('status', GameTransferOffer::PENDING)->where('id', '!=', $offer->id)
            ->update(['status' => GameTransferOffer::REJECTED, 'awaiting' => 'none', 'closing_note' => 'The player moved to another club.', 'closed_on' => $save->game_date]);
        $this->close($offer, GameTransferOffer::COMPLETED);

        return $transfer;
    }

    // ---------- checks and helpers ----------

    /** @throws GameRuleException not_your_player / player_on_loan */
    private function assertOwnedBy(GamePlayer $player, GameClub $club): void
    {
        if ($player->game_club_id !== $club->id) {
            throw new GameRuleException('not_your_player', 'That player is not at your club.', 403);
        }
        if ($player->activeLoan()->exists()) {
            throw new GameRuleException('player_on_loan', 'A player on loan cannot be put on the market.');
        }
    }

    /** @throws GameRuleException window_closed / player_on_loan / invalid_loan */
    private function assertCanMove(GameSave $save, GamePlayer $player, string $type, ?string $loanEndsOn): void
    {
        if ($type === GameTransferOffer::FREE_AGENT) {
            return;
        }
        if (! $this->market->currentWindow($save)) {
            throw new GameRuleException('window_closed', 'The transfer window is closed. Free agents can still be signed.');
        }
        if ($player->activeLoan()->exists()) {
            throw new GameRuleException('player_on_loan', 'This player is out on loan and cannot move until the loan ends.');
        }
        if ($type === GameTransferOffer::LOAN) {
            $end = Carbon::parse($loanEndsOn);
            $contractEnd = $player->activeContract()->value('ends_on');
            if ($end->lte($save->game_date) || ($contractEnd && $end->gt(Carbon::parse($contractEnd)))) {
                throw new GameRuleException('invalid_loan', 'A loan has to end after today and before the player\'s contract does.');
            }
        }
    }

    /** @throws GameRuleException insufficient_funds / insufficient_budget */
    private function assertAffordable(GameClub $buyer, int $fee): void
    {
        if ($fee > $buyer->balance) {
            throw new GameRuleException('insufficient_funds', "{$buyer->name} cannot afford this: balance {$buyer->balance}, needed $fee.");
        }
        if ($fee > $buyer->transfer_budget) {
            throw new GameRuleException('insufficient_budget', "{$buyer->name} has only {$buyer->transfer_budget} left in its transfer budget.");
        }
    }

    private function inviteBids(GameTransferListing $listing, GamePlayer $player): void
    {
        $save = $player->gameSave;
        if (! $listing->club->is_user_controlled || ! $this->market->currentWindow($save)) {
            return;
        }
        // no bids for a player the club could not let go anyway
        if ($this->squads->size($listing->club) <= config('game.squad.min')) {
            return;
        }
        foreach ($this->negotiator->listingBids($listing, $player) as ['club' => $club, 'fee' => $fee]) {
            $isLoan = $listing->type === GameTransferOffer::LOAN;
            $this->createOffer($save, $club, $player, $listing->type, $fee, [
                'wage' => $isLoan ? null : $player->ratings->wage_expectation,
                'contract_years' => $isLoan ? null : config('game.negotiation.cpu_contract_years'),
                'loan_ends_on' => $isLoan ? GameSave::seasonEnd($save->game_date)->toDateString() : null,
            ], playerAgreed: true, listing: $listing);
        }
    }

    private function createOffer(GameSave $save, GameClub $buyer, GamePlayer $player, string $type, int $fee, array $terms, bool $playerAgreed = false, ?GameTransferListing $listing = null): GameTransferOffer
    {
        $isLoan = $type === GameTransferOffer::LOAN;
        $offer = GameTransferOffer::create([
            'game_save_id' => $save->id, 'game_player_id' => $player->id, 'buying_club_id' => $buyer->id, 'selling_club_id' => $player->game_club_id,
            'game_transfer_listing_id' => ($listing ?? $player->activeListing)?->id, 'type' => $type, 'fee' => $fee,
            'wage' => $isLoan ? null : $terms['wage'], 'contract_years' => $isLoan ? null : $terms['contract_years'],
            'loan_ends_on' => $isLoan ? $terms['loan_ends_on'] : null,
            'status' => GameTransferOffer::PENDING, 'awaiting' => GameTransferOffer::SELLER, 'player_agreed' => $playerAgreed || $isLoan,
            'rounds' => 1, 'offered_on' => $save->game_date,
        ]);
        $this->say($offer, 'buyer', 'offer', ['fee' => $fee, 'wage' => $offer->wage, 'contract_years' => $offer->contract_years]);

        return $offer;
    }

    /** The side $actor is on, provided the offer is open and waiting for that side. */
    private function turnOf(GameTransferOffer $offer, GameClub $actor): string
    {
        $side = $this->sideOf($offer, $actor);
        if ($side !== $offer->awaiting) {
            throw new GameRuleException('not_your_turn', 'This offer is waiting for the other side to answer.', 409);
        }

        return $side;
    }

    private function sideOf(GameTransferOffer $offer, GameClub $actor): string
    {
        if (! $offer->isPending()) {
            throw new GameRuleException('offer_closed', 'This offer is no longer open.', 409);
        }

        return $offer->sideOf($actor) ?? throw new GameRuleException('not_your_offer', 'Your club is not part of this offer.', 403);
    }

    private function say(GameTransferOffer $offer, string $side, string $action, array $terms = [], ?string $note = null): void
    {
        $offer->negotiations()->create([
            'step' => (int) $offer->negotiations()->max('step') + 1, 'side' => $side, 'action' => $action,
            'fee' => $terms['fee'] ?? null, 'wage' => $terms['wage'] ?? null, 'contract_years' => $terms['contract_years'] ?? null, 'note' => $note,
        ]);
    }

    private function close(GameTransferOffer $offer, string $status, ?string $note = null): void
    {
        $offer->update(['status' => $status, 'awaiting' => 'none', 'closing_note' => $note, 'closed_on' => $offer->gameSave->game_date]);
    }

    /**
     * @template T
     *
     * @param  Closure(GamePlayer): T  $callback
     * @return T
     */
    private function withPlayerLocked(GamePlayer|int $player, Closure $callback): mixed
    {
        $id = $player instanceof GamePlayer ? $player->id : $player;

        return DB::transaction(fn () => $callback(GamePlayer::whereKey($id)->lockForUpdate()->firstOrFail()));
    }

    /**
     * Lock the offer's player, then the offer, and hand both over fresh from the database.
     *
     * @template T
     *
     * @param  Closure(GameTransferOffer, GamePlayer): T  $callback
     * @return T
     */
    private function withOfferLocked(GameTransferOffer $offer, Closure $callback): mixed
    {
        return $this->withPlayerLocked($offer->game_player_id, fn (GamePlayer $player) => $callback(GameTransferOffer::whereKey($offer->id)->lockForUpdate()->firstOrFail(), $player));
    }
}
