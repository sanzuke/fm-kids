<?php

namespace Tests\Feature;

use App\Exceptions\GameRuleException;
use App\Models\GameClub;
use App\Models\GameFinanceTransaction;
use App\Models\GameLoanAgreement;
use App\Models\GameSave;
use App\Models\GameTransfer;
use App\Models\GameTransferOffer;
use App\Models\User;
use App\Services\Game\GameWorldService;
use App\Services\Transfers\TransferService;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\BuildsGameWorld;
use Tests\TestCase;

class TransferServiceTest extends TestCase
{
    use BuildsGameWorld, RefreshDatabase;

    private GameSave $save;

    private GameClub $alpha;

    private GameClub $beta;

    private GameClub $gamma;

    private TransferService $transfers;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedSmallWorld();
        $this->save = $this->newSave();
        $this->alpha = $this->save->userClub;
        $this->beta = $this->gameClub($this->save, 'Beta FC');
        $this->gamma = $this->gameClub($this->save, 'Gamma FC');
        $this->transfers = app(TransferService::class);
    }

    private function assertRefused(string $code, Closure $action): void
    {
        try {
            $action();
            $this->fail("Expected the rule [$code] to refuse this.");
        } catch (GameRuleException $e) {
            $this->assertSame($code, $e->errorCode, $e->getMessage());
        }
    }

    private function steps(GameTransferOffer $offer): array
    {
        return $offer->negotiations()->get()->map(fn ($n) => "$n->side:$n->action")->all();
    }

    public function test_a_fair_offer_completes_the_transfer(): void
    {
        $player = $this->playerOf($this->beta);
        $terms = $this->fairTerms($player);
        $oldContract = $player->activeContract;
        [$alphaBalance, $betaBalance, $alphaBudget, $betaBudget] = [$this->alpha->balance, $this->beta->balance, $this->alpha->transfer_budget, $this->beta->transfer_budget];

        $offer = $this->transfers->makeOffer($this->alpha, $player, $terms);

        $this->assertSame(['completed', 'none'], [$offer->status, $offer->awaiting]);
        $this->assertSame(['buyer:offer', 'seller:accept', 'player:accept'], $this->steps($offer));

        // ownership and contract
        $this->assertSame($this->alpha->id, $player->fresh()->game_club_id);
        $this->assertSame(['transferred', '2026-07-01'], [$oldContract->fresh()->status, $oldContract->fresh()->ended_on->toDateString()]);
        $contract = $player->activeContract()->sole();
        $this->assertSame([$this->alpha->id, $terms['wage'], '2029-06-30'], [$contract->game_club_id, $contract->wage, $contract->ends_on->toDateString()]);

        // money on both sides, with ledger lines pointing at the transfer
        $transfer = GameTransfer::sole();
        $this->assertSame([$alphaBalance - $terms['fee'], $alphaBudget - $terms['fee']], [$this->alpha->fresh()->balance, $this->alpha->fresh()->transfer_budget]);
        $this->assertSame([$betaBalance + $terms['fee'], $betaBudget + $terms['fee']], [$this->beta->fresh()->balance, $this->beta->fresh()->transfer_budget]);
        $paid = GameFinanceTransaction::where('type', 'transfer_fee_paid')->sole();
        $received = GameFinanceTransaction::where('type', 'transfer_fee_received')->sole();
        $this->assertSame([$this->alpha->id, -$terms['fee'], $alphaBalance - $terms['fee'], $transfer->id], [$paid->game_club_id, $paid->amount, $paid->balance_after, $paid->reference_id]);
        $this->assertSame([$this->beta->id, $terms['fee'], $betaBalance + $terms['fee']], [$received->game_club_id, $received->amount, $received->balance_after]);
        $this->assertTrue($paid->reference->is($transfer));

        // history
        $this->assertSame(
            ['transfer', $terms['fee'], $terms['wage'], $this->beta->id, $this->alpha->id, $offer->id, 2026, '2026-07-01'],
            [$transfer->type, $transfer->fee, $transfer->wage, $transfer->from_club_id, $transfer->to_club_id, $transfer->game_transfer_offer_id, $transfer->season, $transfer->game_date->toDateString()],
        );
        $this->assertSame('summer', $this->save->transferWindows()->findOrFail($transfer->game_transfer_window_id)->name);
    }

    public function test_a_low_bid_is_countered_and_the_counter_can_be_accepted(): void
    {
        $player = $this->playerOf($this->beta);
        $asking = $this->fairTerms($player)['fee'];
        $bid = (int) floor($asking * 0.8);

        $offer = $this->transfers->makeOffer($this->alpha, $player, $this->fairTerms($player, ['fee' => $bid]));

        $counter = (int) ceil(($bid + $asking) / 2);
        $this->assertSame(['pending', 'buyer', $counter, 2], [$offer->status, $offer->awaiting, $offer->fee, $offer->rounds]);
        $this->assertSame($this->beta->id, $player->fresh()->game_club_id);
        $this->assertSame(0, GameTransfer::count());

        $offer = $this->transfers->accept($offer, $this->alpha);

        $this->assertSame('completed', $offer->status);
        $this->assertSame(['buyer:offer', 'seller:counter', 'buyer:accept', 'player:accept'], $this->steps($offer));
        $this->assertSame($counter, GameTransfer::sole()->fee);
        $this->assertSame($this->alpha->id, $player->fresh()->game_club_id);
    }

    public function test_a_selling_club_holds_its_counter_and_gives_up_after_too_many_rounds(): void
    {
        $player = $this->playerOf($this->beta);
        $asking = $this->fairTerms($player)['fee'];
        $bid = (int) floor($asking * 0.8);
        $offer = $this->transfers->makeOffer($this->alpha, $player, $this->fairTerms($player, ['fee' => $bid]));
        $firstCounter = $offer->fee;

        // a slightly better bid: the club does not go above the fee it already named
        $offer = $this->transfers->counter($offer, $this->alpha, ['fee' => $bid + 1]);
        $this->assertSame(['pending', 'buyer', $firstCounter, 4], [$offer->status, $offer->awaiting, $offer->fee, $offer->rounds]);

        $offer = $this->transfers->counter($offer, $this->alpha, ['fee' => $bid + 2]);
        $this->assertSame(['rejected', 'none', 'The clubs could not agree on a fee.'], [$offer->status, $offer->awaiting, $offer->closing_note]);
        $this->assertSame($this->beta->id, $player->fresh()->game_club_id);

        $this->assertRefused('offer_closed', fn () => $this->transfers->accept($offer, $this->alpha));
        $this->assertRefused('offer_closed', fn () => $this->transfers->counter($offer, $this->alpha, ['fee' => $asking]));
    }

    public function test_meeting_the_clubs_own_counter_is_enough(): void
    {
        $player = $this->playerOf($this->beta);
        $asking = $this->fairTerms($player)['fee'];
        $offer = $this->transfers->makeOffer($this->alpha, $player, $this->fairTerms($player, ['fee' => (int) floor($asking * 0.8)]));
        $counter = $offer->fee;
        $this->assertLessThan($asking, $counter);

        // same fee as the counter, with a longer contract
        $offer = $this->transfers->counter($offer, $this->alpha, ['fee' => $counter, 'contract_years' => 5]);

        $this->assertSame('completed', $offer->status);
        $this->assertSame('2031-06-30', $player->activeContract()->sole()->ends_on->toDateString());
    }

    public function test_an_insulting_bid_is_rejected_outright(): void
    {
        $player = $this->playerOf($this->beta);
        $offer = $this->transfers->makeOffer($this->alpha, $player, $this->fairTerms($player, ['fee' => (int) floor($this->fairTerms($player)['fee'] * 0.5)]));

        $this->assertSame('rejected', $offer->status);
        $this->assertSame(['buyer:offer', 'seller:reject'], $this->steps($offer));

        // a closed offer does not block a new one
        $this->assertSame('completed', $this->transfers->makeOffer($this->alpha, $player, $this->fairTerms($player))->status);
    }

    public function test_the_player_negotiates_the_wage(): void
    {
        $player = $this->playerOf($this->beta);
        $player->ratings->update(['wage_expectation' => 100]);
        $this->alpha->update(['wage_budget' => 5000]);
        $expected = 100;

        $offer = $this->transfers->makeOffer($this->alpha, $player, $this->fairTerms($player, ['wage' => 70]));
        $this->assertSame(['pending', 'buyer', $expected, true], [$offer->status, $offer->awaiting, $offer->wage, $offer->player_agreed]);
        $this->assertSame(['buyer:offer', 'seller:accept', 'player:counter'], $this->steps($offer));

        // a little under the asked wage is still fine for the player
        $offer = $this->transfers->counter($offer, $this->alpha, ['wage' => 92]);
        $this->assertSame('completed', $offer->status);
        $this->assertSame(92, $player->activeContract()->sole()->wage);

        $other = $this->playerOf($this->gamma);
        $other->ratings->update(['wage_expectation' => 100]);
        $refused = $this->transfers->makeOffer($this->alpha, $other, $this->fairTerms($other, ['wage' => 40]));
        $this->assertSame(['rejected', 'The player turned down the wage.'], [$refused->status, $refused->closing_note]);
        $this->assertSame($this->gamma->id, $other->fresh()->game_club_id);
    }

    public function test_listing_a_player_brings_bids_that_can_be_accepted(): void
    {
        $player = $this->playerOf($this->alpha);
        $value = $player->ratings->market_value;
        [$alphaBalance, $betaBalance] = [$this->alpha->balance, $this->beta->balance];

        $listing = $this->transfers->listPlayer($this->alpha, $player, $value);

        $bids = $listing->offers()->orderBy('id')->get();
        $this->assertSame([$this->beta->id, $this->gamma->id], $bids->pluck('buying_club_id')->all());
        $bid = (int) ceil($value * 0.9);
        foreach ($bids as $offer) {
            $this->assertSame(['pending', 'seller', $bid, $this->alpha->id, $listing->id], [$offer->status, $offer->awaiting, $offer->fee, $offer->selling_club_id, $offer->game_transfer_listing_id]);
        }
        $this->assertRefused('already_listed', fn () => $this->transfers->listPlayer($this->alpha, $player, $value));

        $done = $this->transfers->accept($bids[0], $this->alpha);

        $this->assertSame('completed', $done->status);
        $this->assertSame($this->beta->id, $player->fresh()->game_club_id);
        $this->assertSame([$alphaBalance + $bid, $betaBalance - $bid], [$this->alpha->fresh()->balance, $this->beta->fresh()->balance]);
        $this->assertSame('sold', $listing->fresh()->status);
        $this->assertSame(['rejected', 'The player moved to another club.'], [$bids[1]->fresh()->status, $bids[1]->fresh()->closing_note]);
        $this->assertRefused('offer_closed', fn () => $this->transfers->accept($bids[1]->fresh(), $this->alpha));
        $this->assertSame(1, GameTransfer::count());
    }

    public function test_the_seller_can_counter_a_bid_up_to_what_the_buyer_will_pay(): void
    {
        $player = $this->playerOf($this->alpha);
        $value = $player->ratings->market_value;
        $limit = (int) ceil($value * 1.2);
        [$first, $second] = $this->transfers->listPlayer($this->alpha, $player, $value)->offers()->orderBy('id')->get()->all();

        // far too much: the buyer raises its bid to its limit and waits
        $offer = $this->transfers->counter($first, $this->alpha, ['fee' => $value * 3]);
        $this->assertSame(['pending', 'seller', $limit], [$offer->status, $offer->awaiting, $offer->fee]);
        $this->assertSame(['buyer:offer', 'seller:counter', 'buyer:counter'], $this->steps($offer));

        // still too much: the buyer walks away
        $offer = $this->transfers->counter($offer, $this->alpha, ['fee' => $value * 3]);
        $this->assertSame(['withdrawn', 'The asking price is too high for the club.'], [$offer->status, $offer->closing_note]);

        // the other bidder takes a counter within its limit
        $offer = $this->transfers->counter($second, $this->alpha, ['fee' => $limit]);
        $this->assertSame('completed', $offer->status);
        $this->assertSame($limit, GameTransfer::sole()->fee);
        $this->assertSame($this->gamma->id, $player->fresh()->game_club_id);

        $again = $this->transfers->listPlayer($this->alpha, $this->playerOf($this->alpha, 'GK'), 100)->offers()->first();
        $this->assertNull($again, 'Alpha is down to the smallest squad, so nobody may take another player');
    }

    public function test_a_bid_can_be_rejected_and_an_offer_withdrawn(): void
    {
        $mine = $this->playerOf($this->alpha);
        $bid = $this->transfers->listPlayer($this->alpha, $mine, $mine->ratings->market_value)->offers()->orderBy('id')->first();
        $this->assertRefused('invalid_counter', fn () => $this->transfers->counter($bid, $this->alpha, ['wage' => 5]));

        $rejected = $this->transfers->reject($bid, $this->alpha, 'Not for sale after all');
        $this->assertSame(['rejected', 'Not for sale after all'], [$rejected->status, $rejected->closing_note]);

        $target = $this->playerOf($this->beta);
        $offer = $this->transfers->makeOffer($this->alpha, $target, $this->fairTerms($target, ['fee' => (int) floor($this->fairTerms($target)['fee'] * 0.8)]));
        $withdrawn = $this->transfers->reject($offer, $this->alpha);
        $this->assertSame('withdrawn', $withdrawn->status);
        $this->assertSame(['buyer:offer', 'seller:counter', 'buyer:reject'], $this->steps($withdrawn));
        $this->assertSame($this->beta->id, $target->fresh()->game_club_id);
        $this->assertSame(0, GameTransfer::count());
    }

    public function test_only_the_side_whose_turn_it_is_can_answer(): void
    {
        $mine = $this->playerOf($this->alpha);
        $bid = $this->transfers->listPlayer($this->alpha, $mine, $mine->ratings->market_value)->offers()->orderBy('id')->first();

        // a club that is not part of the offer
        $this->assertRefused('not_your_offer', fn () => $this->transfers->accept($bid, $this->gamma));
        // the buyer cannot accept its own bid
        $this->assertRefused('not_your_turn', fn () => $this->transfers->accept($bid, $this->beta));
        $this->assertRefused('not_your_turn', fn () => $this->transfers->counter($bid, $this->beta, ['fee' => 1]));

        $this->assertSame('pending', $bid->fresh()->status);
        $this->assertSame($this->alpha->id, $mine->fresh()->game_club_id);
    }

    public function test_a_club_without_the_money_cannot_buy(): void
    {
        $player = $this->playerOf($this->beta);
        $terms = $this->fairTerms($player);

        // not enough in the transfer budget
        $this->alpha->update(['transfer_budget' => $terms['fee'] - 1]);
        $this->assertRefused('insufficient_budget', fn () => $this->transfers->makeOffer($this->alpha, $player, $terms));

        // not enough money at all
        $this->alpha->update(['balance' => $terms['fee'] - 1, 'transfer_budget' => $terms['fee'] + 100]);
        $this->assertRefused('insufficient_funds', fn () => $this->transfers->makeOffer($this->alpha, $player, $terms));

        $this->assertSame(0, GameTransferOffer::count());
        $this->assertSame(0, GameTransfer::count());
        $this->assertSame($this->beta->id, $player->fresh()->game_club_id);
        $this->assertSame($terms['fee'] - 1, $this->alpha->fresh()->balance);
        $this->assertSame(3, GameFinanceTransaction::count());
    }

    public function test_money_spent_elsewhere_stops_a_deal_at_completion(): void
    {
        $player = $this->playerOf($this->beta);
        $offer = $this->transfers->makeOffer($this->alpha, $player, $this->fairTerms($player, ['fee' => (int) floor($this->fairTerms($player)['fee'] * 0.8)]));
        $this->assertSame('pending', $offer->status);
        $steps = $this->steps($offer);

        // the money is gone before the counter is accepted
        $this->alpha->update(['balance' => $offer->fee - 1]);
        $betaBalance = $this->beta->balance;

        $this->assertRefused('insufficient_funds', fn () => $this->transfers->accept($offer, $this->alpha->fresh()));

        // nothing of the deal happened, and the offer is still open
        $this->assertSame(['pending', 'buyer'], [$offer->fresh()->status, $offer->fresh()->awaiting]);
        $this->assertSame($steps, $this->steps($offer));
        $this->assertSame($this->beta->id, $player->fresh()->game_club_id);
        $this->assertSame('active', $player->activeContract()->sole()->status);
        $this->assertSame($betaBalance, $this->beta->fresh()->balance);
        $this->assertSame(0, GameTransfer::count());
        $this->assertSame(0, GameFinanceTransaction::where('type', '!=', 'initial')->count());

        // with the money back, the same offer goes through
        $this->alpha->update(['balance' => 50000]);
        $this->assertSame('completed', $this->transfers->accept($offer, $this->alpha->fresh())->status);
    }

    public function test_a_wage_the_club_cannot_carry_stops_the_deal(): void
    {
        $player = $this->playerOf($this->beta);
        $this->alpha->update(['wage_budget' => $this->alpha->wageBill()]);

        $this->assertRefused('wage_budget_exceeded', fn () => $this->transfers->makeOffer($this->alpha->fresh(), $player, $this->fairTerms($player)));

        $this->assertSame(0, GameTransferOffer::count());
        $this->assertSame($this->beta->id, $player->fresh()->game_club_id);
        $this->assertSame($this->beta->balance, $this->beta->fresh()->balance);
    }

    public function test_ownership_is_checked(): void
    {
        $theirs = $this->playerOf($this->beta);
        $mine = $this->playerOf($this->alpha);

        $this->assertRefused('not_your_player', fn () => $this->transfers->listPlayer($this->alpha, $theirs, 100));
        $this->assertRefused('already_yours', fn () => $this->transfers->makeOffer($this->alpha, $mine, $this->fairTerms($mine)));
        $this->assertRefused('not_a_free_agent', fn () => $this->transfers->makeOffer($this->alpha, $theirs, $this->fairTerms($theirs, ['type' => 'free_agent'])));
        $this->assertRefused('player_is_free_agent', fn () => $this->transfers->makeOffer($this->alpha, $this->freeAgent($this->save), $this->fairTerms($theirs)));

        // one open offer per club and player
        $open = $this->transfers->makeOffer($this->alpha, $theirs, $this->fairTerms($theirs, ['fee' => (int) floor($this->fairTerms($theirs)['fee'] * 0.8)]));
        $this->assertRefused('duplicate_offer', fn () => $this->transfers->makeOffer($this->alpha, $theirs, $this->fairTerms($theirs)));

        // the player left the selling club while the offer was open
        $theirs->update(['game_club_id' => $this->gamma->id]);
        $this->assertRefused('player_not_owned', fn () => $this->transfers->accept($open, $this->alpha));
        $this->assertSame('pending', $open->fresh()->status);
        $this->assertSame(0, GameTransfer::count());

        // a player of another save
        $other = $this->newSave(User::factory()->create(), 'Other');
        $this->assertRefused('wrong_save', fn () => $this->transfers->makeOffer($this->alpha, $this->playerOf($this->gameClub($other, 'Beta FC')), $this->fairTerms($theirs)));
    }

    public function test_a_club_keeps_enough_players(): void
    {
        $first = $this->playerOf($this->beta, 'ST');
        $this->assertSame('completed', $this->transfers->makeOffer($this->alpha, $first, $this->fairTerms($first))->status);

        // Beta is down to eleven and will not sell another
        $second = $this->playerOf($this->beta, 'GK');
        $offer = $this->transfers->makeOffer($this->alpha, $second, $this->fairTerms($second));
        $this->assertSame(['rejected', 'The club cannot spare any player right now.'], [$offer->status, $offer->closing_note]);
    }

    public function test_a_player_can_be_loaned_and_comes_back(): void
    {
        $player = $this->playerOf($this->beta);
        $fee = (int) ceil($player->ratings->market_value * 0.1);
        $contract = $player->activeContract;
        [$alphaBalance, $betaBalance] = [$this->alpha->balance, $this->beta->balance];

        $this->assertRefused('invalid_loan', fn () => $this->transfers->makeOffer($this->alpha, $player, ['type' => 'loan', 'fee' => $fee, 'loan_ends_on' => '2026-07-01']));
        $this->assertRefused('invalid_loan', fn () => $this->transfers->makeOffer($this->alpha, $player, ['type' => 'loan', 'fee' => $fee, 'loan_ends_on' => $contract->ends_on->copy()->addDay()->toDateString()]));

        $offer = $this->transfers->makeOffer($this->alpha, $player, ['type' => 'loan', 'fee' => $fee, 'loan_ends_on' => '2027-01-15']);

        $this->assertSame('completed', $offer->status);
        $this->assertSame(['buyer:offer', 'seller:accept'], $this->steps($offer));
        $this->assertSame($this->alpha->id, $player->fresh()->game_club_id);
        // the contract stays with the parent club
        $this->assertSame([$contract->id, $this->beta->id], [$player->activeContract()->sole()->id, $player->activeContract()->sole()->game_club_id]);
        $loan = GameLoanAgreement::sole();
        $this->assertSame(['active', $this->beta->id, $this->alpha->id, $fee, '2027-01-15'], [$loan->status, $loan->parent_club_id, $loan->loan_club_id, $loan->fee, $loan->ends_on->toDateString()]);
        $this->assertSame([$alphaBalance - $fee, $betaBalance + $fee], [$this->alpha->fresh()->balance, $this->beta->fresh()->balance]);
        $this->assertSame(['loan_fee_paid', 'loan_fee_received'], GameFinanceTransaction::where('type', '!=', 'initial')->orderBy('id')->pluck('type')->all());

        // a loaned player cannot be sold on or bought away
        $this->assertRefused('player_on_loan', fn () => $this->transfers->listPlayer($this->alpha, $player->fresh(), 100));
        $this->assertRefused('player_on_loan', fn () => $this->transfers->makeOffer($this->gamma, $player->fresh(), $this->fairTerms($player)));

        $world = app(GameWorldService::class);
        $world->advanceTo($this->save, '2027-01-15');
        $this->assertSame($this->alpha->id, $player->fresh()->game_club_id);

        $world->advanceTo($this->save, '2027-01-16');
        $this->assertSame($this->beta->id, $player->fresh()->game_club_id);
        $this->assertSame('completed', $loan->fresh()->status);
        $this->assertSame(['loan', 'loan_return'], GameTransfer::orderBy('id')->pluck('type')->all());
        $back = GameTransfer::where('type', 'loan_return')->sole();
        $this->assertSame([$this->alpha->id, $this->beta->id, '2027-01-15'], [$back->from_club_id, $back->to_club_id, $back->game_date->toDateString()]);
    }

    public function test_a_free_agent_can_be_signed_even_outside_the_window(): void
    {
        app(GameWorldService::class)->advanceTo($this->save, '2026-10-01');
        $free = $this->freeAgent($this->save);
        $contracted = $this->playerOf($this->beta);
        $balance = $this->alpha->balance;

        $this->assertRefused('window_closed', fn () => $this->transfers->makeOffer($this->alpha, $contracted, $this->fairTerms($contracted)));
        $this->assertRefused('window_closed', fn () => $this->transfers->makeOffer($this->alpha, $contracted, ['type' => 'loan', 'fee' => 50, 'loan_ends_on' => '2027-01-15']));

        // a fee makes no sense for a free agent and is ignored
        $offer = $this->transfers->makeOffer($this->alpha, $free, ['type' => 'free_agent', 'fee' => 999, 'wage' => $free->ratings->wage_expectation, 'contract_years' => 2]);

        $this->assertSame(['completed', 0, null], [$offer->status, $offer->fee, $offer->selling_club_id]);
        $this->assertSame(['buyer:offer', 'player:accept'], $this->steps($offer));
        $this->assertSame($this->alpha->id, $free->fresh()->game_club_id);
        $contract = $free->activeContract()->sole();
        $this->assertSame([$this->alpha->id, '2026-10-01', '2028-06-30'], [$contract->game_club_id, $contract->starts_on->toDateString(), $contract->ends_on->toDateString()]);
        $this->assertSame($balance, $this->alpha->fresh()->balance);
        $transfer = GameTransfer::sole();
        $this->assertSame(['free_agent', 0, null, null], [$transfer->type, $transfer->fee, $transfer->from_club_id, $transfer->game_transfer_window_id]);
        $this->assertSame(0, GameFinanceTransaction::where('type', '!=', 'initial')->count());

        // a free agent also wants a decent wage
        $other = $this->freeAgent($this->save, 'CM');
        $other->ratings->update(['wage_expectation' => 100]);
        $this->alpha->update(['wage_budget' => 5000]);
        $low = $this->transfers->makeOffer($this->alpha->fresh(), $other, ['type' => 'free_agent', 'wage' => 70, 'contract_years' => 2]);
        $this->assertSame(['pending', 'buyer', 100], [$low->status, $low->awaiting, $low->wage]);
        $this->assertRefused('invalid_counter', fn () => $this->transfers->counter($low, $this->alpha, ['fee' => 10]));
        $this->assertSame('completed', $this->transfers->accept($low, $this->alpha)->status);
        $this->assertSame($this->alpha->id, $other->fresh()->game_club_id);
    }

    public function test_an_expired_contract_takes_the_player_off_the_market(): void
    {
        $expiring = $this->save->contracts()->where('game_club_id', $this->alpha->id)->whereDate('ends_on', '2027-06-30')->firstOrFail();
        $player = $expiring->gamePlayer;
        $world = app(GameWorldService::class);

        // listed outside a window: bids arrive when the winter window opens
        $world->advanceTo($this->save, '2026-12-01');
        $listing = $this->transfers->listPlayer($this->alpha, $player, $player->ratings->market_value);
        $this->assertSame(0, $listing->offers()->count());
        $world->advanceTo($this->save, '2027-01-02');
        $this->assertSame(2, $listing->offers()->where('status', 'pending')->count());

        $world->advanceTo($this->save, '2027-07-01');

        $this->assertSame('expired', $expiring->fresh()->status);
        $this->assertNull($player->fresh()->game_club_id);
        $this->assertSame('withdrawn', $listing->fresh()->status);
        $this->assertSame(['rejected'], $listing->offers()->distinct()->pluck('status')->all());
        $this->assertSame('The contract ran out.', $listing->offers()->first()->closing_note);
        $this->assertRefused('offer_closed', fn () => $this->transfers->accept($listing->offers()->first(), $this->alpha));
        $this->assertRefused('not_your_player', fn () => $this->transfers->listPlayer($this->alpha, $player->fresh(), 100));

        // now a free agent, the player can be signed again by anyone
        $offer = $this->transfers->makeOffer($this->alpha, $player->fresh(), ['type' => 'free_agent', 'wage' => $player->ratings->wage_expectation, 'contract_years' => 1]);
        $this->assertSame('completed', $offer->status);
        $this->assertSame(['expired', 'active'], $player->contracts()->orderBy('id')->pluck('status')->all());
        $this->assertSame('2028-06-30', $player->activeContract()->sole()->ends_on->toDateString());
    }

    public function test_transfers_stay_inside_their_save(): void
    {
        $other = $this->newSave($this->save->user, 'Second career');
        $player = $this->playerOf($this->beta);
        $twin = $other->players()->where('player_id', $player->player_id)->sole();

        $this->transfers->makeOffer($this->alpha, $player, $this->fairTerms($player));

        $this->assertSame($this->alpha->id, $player->fresh()->game_club_id);
        $this->assertSame('Beta FC', $twin->fresh()->club->name);
        $this->assertSame('active', $twin->activeContract()->sole()->status);
        $this->assertSame(1, $this->save->transfers()->count());
        $this->assertSame(0, $other->transfers()->count());
        $this->assertSame(0, $other->transferOffers()->count());
        $this->assertSame(0, $other->financeTransactions()->where('type', '!=', 'initial')->count());
        foreach (['Alpha FC', 'Beta FC'] as $name) {
            $club = $this->gameClub($other, $name);
            $this->assertSame($club->financeTransactions()->sole()->amount, $club->balance);
        }
    }
}
