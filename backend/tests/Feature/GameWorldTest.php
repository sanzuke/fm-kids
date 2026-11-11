<?php

namespace Tests\Feature;

use App\Exceptions\GameRuleException;
use App\Models\GameClub;
use App\Models\GameFinanceTransaction;
use App\Models\GamePlayer;
use App\Models\GamePlayerContract;
use App\Models\Player;
use App\Models\User;
use App\Services\Football\ApiFootballImporter;
use App\Services\Game\ContractService;
use App\Services\Game\DevelopmentService;
use App\Services\Game\FinanceService;
use App\Services\Game\GameWorldService;
use App\Services\Game\SquadService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\ApiFootballFixtures;
use Tests\Support\BuildsGameWorld;
use Tests\TestCase;

class GameWorldTest extends TestCase
{
    use ApiFootballFixtures, BuildsGameWorld, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedSmallWorld();
    }

    public function test_a_new_save_copies_the_whole_catalogue(): void
    {
        $save = $this->newSave();

        $this->assertSame(2026, $save->season);
        $this->assertSame('2026-07-01', $save->game_date->toDateString());
        $this->assertSame('Alpha FC', $save->userClub->name);
        $this->assertTrue($save->userClub->is_user_controlled);
        $this->assertSame(3, $save->clubs()->count());
        $this->assertSame(1, $save->clubs()->where('is_user_controlled', true)->count());
        $this->assertSame(40, $save->players()->count());
        $this->assertSame(4, $save->players()->whereNull('game_club_id')->count());
        $this->assertSame(12, app(SquadService::class)->size($save->userClub));

        // attributes start as the catalogue's
        $gp = $save->players()->with(['player', 'ratings'])->first();
        // (jsonb does not keep key order, so compare by key)
        $this->assertEquals($gp->player->base_attributes, $gp->ratings->skills());
        $this->assertSame([$gp->player->base_overall, $gp->player->base_potential, $gp->player->base_market_value, $gp->player->base_wage],
            [$gp->ratings->overall, $gp->ratings->potential, $gp->ratings->market_value, $gp->ratings->wage_expectation]);

        // every squad player is under contract, free agents are not
        $this->assertSame(36, $save->contracts()->where('status', 'active')->count());
        $this->assertSame(0, GamePlayerContract::whereIn('game_player_id', $save->players()->whereNull('game_club_id')->pluck('id'))->count());
        $contract = $this->playerOf($save->userClub)->activeContract;
        $this->assertSame('2026-07-01', $contract->starts_on->toDateString());
        $this->assertSame('06-30', $contract->ends_on->format('m-d'));
        $this->assertContains($contract->ends_on->year, [2027, 2028, 2029, 2030]);

        // money: balance from reputation, a ledger line for it, and room in the wage budget
        $club = $save->userClub;
        $this->assertSame(2000 + 70 * 150, $club->balance);
        $this->assertSame((int) floor($club->balance * 0.8), $club->transfer_budget);
        $this->assertGreaterThan($club->wageBill(), $club->wage_budget);
        $ledger = $club->financeTransactions()->sole();
        $this->assertSame(['initial', $club->balance, $club->balance], [$ledger->type, $ledger->amount, $ledger->balance_after]);
    }

    public function test_real_and_fictional_players_share_the_same_game_structure(): void
    {
        $real = (new ApiFootballImporter)->importPlayer($this->apiPlayer(77));
        $save = $this->newSave();

        $gameReal = $save->players()->where('player_id', $real->id)->with('ratings')->sole();
        $gameFictional = $save->players()->whereHas('player', fn ($q) => $q->where('origin', 'fictional'))->with('ratings')->first();

        $this->assertSame('real', $gameReal->player->origin->value);
        $this->assertSame(array_keys($gameFictional->getAttributes()), array_keys($gameReal->getAttributes()));
        $this->assertSame(array_keys($gameFictional->ratings->getAttributes()), array_keys($gameReal->ratings->getAttributes()));
        $this->assertSame($real->base_overall, $gameReal->ratings->overall);
    }

    public function test_saves_do_not_share_player_state(): void
    {
        $user = User::factory()->create();
        $a = $this->newSave($user, 'First');
        $b = $this->newSave($user, 'Second', 'Beta FC');
        $c = $this->newSave(User::factory()->create(), 'First');

        $catalogue = Player::whereHas('club', fn ($q) => $q->where('name', 'Alpha FC'))->where('primary_position', 'ST')->firstOrFail();
        $inA = $a->players()->where('player_id', $catalogue->id)->sole();
        $inB = $b->players()->where('player_id', $catalogue->id)->sole();
        $this->assertNotSame($inA->id, $inB->id);

        // progress, a release and spending in save A...
        $development = app(DevelopmentService::class)->apply($inA, ['shooting' => 5, 'stamina' => -2, 'unknown' => 9], 'training');
        app(ContractService::class)->release($inA);
        app(FinanceService::class)->record($a->userClub, -500, 'other', 'Test spend');

        // ...changes save A only
        $this->assertSame(['shooting' => 5, 'stamina' => -2], $development->changes);
        $this->assertSame($catalogue->base_attributes['shooting'] + 5, $inA->ratings()->value('shooting'));
        $this->assertGreaterThan($development->overall_before, $development->overall_after);
        $this->assertNull($inA->fresh()->game_club_id);
        $this->assertSame('terminated', $inA->contracts()->sole()->status);

        foreach ([$b, $c] as $other) {
            $same = $other->players()->where('player_id', $catalogue->id)->with('ratings')->sole();
            $this->assertSame($catalogue->base_attributes['shooting'], $same->ratings->shooting);
            $this->assertSame($catalogue->base_overall, $same->ratings->overall);
            $this->assertSame('Alpha FC', $same->club->name);
            $this->assertSame('active', $same->activeContract->status);
            $this->assertSame(0, $same->development()->count());
            $this->assertSame(2000 + 70 * 150, $this->gameClub($other, 'Alpha FC')->balance);
        }
        $this->assertSame(2000 + 70 * 150 - 500, $this->gameClub($a, 'Alpha FC')->balance);

        // and the catalogue itself is untouched
        $this->assertEquals($catalogue->base_attributes, $catalogue->fresh()->base_attributes);
        $this->assertSame($catalogue->club_id, $catalogue->fresh()->club_id);
    }

    public function test_a_later_api_sync_does_not_change_a_running_save(): void
    {
        $importer = new ApiFootballImporter;
        $real = $importer->importPlayer($this->apiPlayer(77));
        $save = $this->newSave();
        $gp = $save->players()->where('player_id', $real->id)->sole();
        app(DevelopmentService::class)->apply($gp, ['shooting' => 3], 'training');
        $before = $gp->ratings()->first()->getAttributes();

        // the player's real season went much better: the catalogue rating rises
        $stats = $this->apiPlayer(77)['statistics'];
        $stats[0]['games']['rating'] = '8.300000';
        $importer->importPlayer($this->apiPlayer(77, 'T. Sample', ['statistics' => $stats]));

        $this->assertGreaterThan($real->base_overall, $real->fresh()->base_overall);
        $this->assertSame($before, $gp->ratings()->first()->getAttributes());
        $this->assertSame(1, $gp->development()->count());
    }

    public function test_a_save_name_is_unique_per_user(): void
    {
        $user = User::factory()->create();
        $this->newSave($user, 'Career');

        try {
            $this->newSave($user, 'Career');
            $this->fail('Expected the duplicate name to be refused.');
        } catch (GameRuleException $e) {
            $this->assertSame('duplicate_save_name', $e->errorCode);
        }
        $this->assertSame(1, $user->gameSaves()->count());
        $this->assertSame(3, GameClub::count());
    }

    public function test_money_moves_through_the_ledger_and_never_goes_negative(): void
    {
        $save = $this->newSave();
        $club = $save->userClub;
        $finance = app(FinanceService::class);
        $start = $club->balance;

        $line = $finance->record($club, -1000, 'transfer_fee_paid', 'Fee', fromTransferBudget: true);
        $this->assertSame([-1000, $start - 1000], [$line->amount, $line->balance_after]);
        $this->assertSame($start - 1000, $club->fresh()->balance);
        $this->assertSame((int) floor($start * 0.8) - 1000, $club->fresh()->transfer_budget);
        $this->assertNull($finance->record($club, 0, 'other', 'Nothing'));

        foreach ([[-($start), 'other', false, 'insufficient_funds'], [-($club->fresh()->transfer_budget + 1), 'transfer_fee_paid', true, 'insufficient_budget']] as [$amount, $type, $budget, $code]) {
            try {
                $finance->record($club, $amount, $type, 'Too much', fromTransferBudget: $budget);
                $this->fail("Expected $code.");
            } catch (GameRuleException $e) {
                $this->assertSame($code, $e->errorCode);
            }
        }
        $this->assertSame($start - 1000, $club->fresh()->balance);
        $this->assertSame(2, GameFinanceTransaction::where('game_club_id', $club->id)->count());

        // the database itself also refuses a negative balance
        try {
            DB::transaction(fn () => DB::table('game_clubs')->where('id', $club->id)->update(['balance' => -1]));
            $this->fail('Expected the check constraint.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('game_clubs_balance_not_negative', $e->getMessage());
        }
    }

    public function test_a_player_cannot_belong_to_a_club_of_another_save(): void
    {
        $user = User::factory()->create();
        $a = $this->newSave($user, 'A');
        $b = $this->newSave($user, 'B');
        $player = $this->playerOf($a->userClub);

        $this->expectException(QueryException::class);
        $this->expectExceptionMessage('game_players_club_same_save_fk');
        $player->update(['game_club_id' => $b->userClub->id]);
    }

    public function test_contracts_can_be_renewed_within_the_wage_budget(): void
    {
        $save = $this->newSave();
        $club = $save->userClub;
        $player = $this->playerOf($club);
        $contracts = app(ContractService::class);
        $oldWage = $player->activeContract->wage;

        $new = $contracts->sign($player, $club, $oldWage + 5, 3);

        $this->assertSame('2029-06-30', $new->ends_on->toDateString());
        $this->assertSame(1, $player->contracts()->where('status', 'active')->count());
        $this->assertSame('terminated', $player->contracts()->where('status', '!=', 'active')->sole()->status);

        foreach ([[$club->wage_budget, 2, 'wage_budget_exceeded'], [$oldWage, 0, 'invalid_contract'], [$oldWage, 6, 'invalid_contract'], [0, 2, 'invalid_contract']] as [$wage, $years, $code]) {
            try {
                $contracts->sign($player, $club, $wage, $years);
                $this->fail("Expected $code.");
            } catch (GameRuleException $e) {
                $this->assertSame($code, $e->errorCode);
            }
        }
        $this->assertSame($new->id, $player->activeContract()->value('id'));

        // one running contract per player is also a database rule
        $this->expectException(QueryException::class);
        $this->expectExceptionMessage('game_player_contracts_one_active');
        GamePlayerContract::create($new->replicate()->getAttributes());
    }

    public function test_contracts_expire_when_the_calendar_passes_their_end(): void
    {
        $save = $this->newSave();
        $world = app(GameWorldService::class);
        $endingFirst = $save->contracts()->whereDate('ends_on', '2027-06-30')->pluck('game_player_id');
        $this->assertNotEmpty($endingFirst);

        // the last day of the contract is still covered
        $world->advanceTo($save, '2027-06-30');
        $this->assertSame(36, $save->contracts()->where('status', 'active')->count());
        $this->assertSame(2026, $save->season);

        $world->advanceTo($save, '2027-07-01');
        $this->assertSame(2027, $save->fresh()->season);
        $this->assertSame(36 - $endingFirst->count(), $save->contracts()->where('status', 'active')->count());
        $this->assertSame($endingFirst->count(), $save->contracts()->where('status', 'expired')->count());
        $this->assertSame($endingFirst->count(), GamePlayer::whereKey($endingFirst)->whereNull('game_club_id')->count());
        $this->assertSame(4 + $endingFirst->count(), $save->players()->whereNull('game_club_id')->count());

        try {
            $world->advanceTo($save, '2027-01-01');
            $this->fail('Expected date_in_past.');
        } catch (GameRuleException $e) {
            $this->assertSame('date_in_past', $e->errorCode);
        }
    }

    public function test_shirt_numbers_are_unique_within_a_club(): void
    {
        $save = $this->newSave();
        $squad = app(SquadService::class);
        $club = $save->userClub;
        [$first, $second] = $squad->squad($club)->take(2)->all();
        $this->assertGreaterThanOrEqual($second->ratings->overall, $first->ratings->overall);

        $squad->assignNumber($club, $first, 9);
        $squad->assignNumber($this->gameClub($save, 'Beta FC'), $this->playerOf($this->gameClub($save, 'Beta FC')), 9);

        foreach ([[$club, $second, 9, 'number_taken'], [$club, $second, 100, 'invalid_number'], [$this->gameClub($save, 'Beta FC'), $second, 4, 'not_your_player']] as [$c, $p, $n, $code]) {
            try {
                $squad->assignNumber($c, $p, $n);
                $this->fail("Expected $code.");
            } catch (GameRuleException $e) {
                $this->assertSame($code, $e->errorCode);
            }
        }
        $squad->assignNumber($club, $first, null);
        $squad->assignNumber($club, $second, 9);
        $this->assertSame(9, $second->fresh()->squad_number);
    }
}
