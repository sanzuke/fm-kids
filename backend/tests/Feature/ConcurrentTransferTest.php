<?php

namespace Tests\Feature;

use App\Exceptions\GameRuleException;
use App\Models\GameFinanceTransaction;
use App\Models\GameTransfer;
use App\Models\GameTransferOffer;
use App\Services\Transfers\TransferService;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\DB;
use Tests\Support\BuildsGameWorld;
use Tests\TestCase;
use Throwable;

/**
 * Two requests about the same player at the same moment, as two real processes with their own
 * database connections. The data is committed (no wrapping test transaction), so the row locks
 * and unique constraints are what keeps the outcome right.
 */
class ConcurrentTransferTest extends TestCase
{
    use BuildsGameWorld;

    protected function setUp(): void
    {
        parent::setUp();
        if (! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Needs the pcntl extension.');
        }
        if (! RefreshDatabaseState::$migrated) {
            $this->artisan('migrate:fresh');
            RefreshDatabaseState::$migrated = true;
        }
        $this->seedSmallWorld();
    }

    /** These tests commit their data, so they clean up after themselves for the other test classes. */
    protected function tearDown(): void
    {
        $tables = collect(DB::select("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'"))->pluck('tablename');
        DB::statement('TRUNCATE TABLE '.$tables->map(fn ($t) => '"'.$t.'"')->implode(', ').' RESTART IDENTITY CASCADE');
        parent::tearDown();
    }

    /**
     * Run each task in its own process, all released at the same instant.
     *
     * @param  list<callable(): string>  $tasks
     * @return list<string> what each task returned, or the rule code that refused it
     */
    private function race(array $tasks): array
    {
        $startAt = microtime(true) + 0.4;
        $files = [];
        $pids = [];
        // a forked child must not share the parent's database socket
        DB::disconnect();

        foreach ($tasks as $i => $task) {
            $files[$i] = tempnam(sys_get_temp_dir(), 'kfm-race');
            $pid = pcntl_fork();
            if ($pid === 0) {
                try {
                    DB::reconnect();
                    usleep((int) max(0, ($startAt - microtime(true)) * 1_000_000));
                    $result = $task();
                } catch (GameRuleException $e) {
                    $result = $e->errorCode;
                } catch (Throwable $e) {
                    $result = 'crash: '.$e->getMessage();
                }
                file_put_contents($files[$i], $result);
                // leave without running the parent's test teardown a second time
                posix_kill(getmypid(), SIGKILL);
            }
            $pids[] = $pid;
        }
        foreach ($pids as $pid) {
            pcntl_waitpid($pid, $status);
        }
        DB::reconnect();

        return array_map(function (string $file) {
            $result = file_get_contents($file);
            unlink($file);

            return $result;
        }, $files);
    }

    public function test_accepting_the_same_offer_twice_at_once_completes_it_once(): void
    {
        $save = $this->newSave();
        $alpha = $save->userClub;
        $player = $this->playerOf($alpha);
        $offer = app(TransferService::class)->listPlayer($alpha, $player, $player->ratings->market_value)->offers()->orderBy('id')->firstOrFail();
        $balance = $alpha->balance;

        $accept = fn () => app(TransferService::class)->accept(GameTransferOffer::findOrFail($offer->id), $alpha->fresh())->status;
        $results = $this->race([$accept, $accept, $accept]);

        sort($results);
        $this->assertSame(['completed', 'offer_closed', 'offer_closed'], $results);
        $this->assertSame(1, GameTransfer::count());
        $this->assertSame($offer->buying_club_id, $player->fresh()->game_club_id);
        $this->assertSame($balance + $offer->fee, $alpha->fresh()->balance);
        $this->assertSame(1, GameFinanceTransaction::where('type', 'transfer_fee_received')->count());
        $this->assertSame(1, GameFinanceTransaction::where('type', 'transfer_fee_paid')->count());
        $this->assertSame(1, $player->contracts()->where('status', 'active')->count());
    }

    public function test_two_bids_for_one_player_accepted_at_once_sell_the_player_once(): void
    {
        $save = $this->newSave();
        $alpha = $save->userClub;
        $player = $this->playerOf($alpha);
        [$first, $second] = app(TransferService::class)->listPlayer($alpha, $player, $player->ratings->market_value)->offers()->orderBy('id')->get()->all();
        $balance = $alpha->balance;

        $accept = fn (int $id) => fn () => app(TransferService::class)->accept(GameTransferOffer::findOrFail($id), $alpha->fresh())->status;
        $results = $this->race([$accept($first->id), $accept($second->id)]);

        sort($results);
        $this->assertSame(['completed', 'offer_closed'], $results);
        $transfer = GameTransfer::sole();
        $winner = GameTransferOffer::where('status', 'completed')->sole();
        $this->assertSame($winner->id, $transfer->game_transfer_offer_id);
        $this->assertSame($winner->buying_club_id, $player->fresh()->game_club_id);
        $this->assertSame('rejected', GameTransferOffer::whereKeyNot($winner->id)->sole()->status);
        // paid once, by the winner only
        $this->assertSame($balance + $winner->fee, $alpha->fresh()->balance);
        $this->assertSame([$winner->buying_club_id], GameFinanceTransaction::where('type', 'transfer_fee_paid')->pluck('game_club_id')->all());
        $this->assertSame(1, $player->contracts()->where('status', 'active')->count());
    }

    public function test_two_clubs_signing_the_same_free_agent_at_once_get_one_contract(): void
    {
        $save = $this->newSave();
        $free = $this->freeAgent($save);
        $terms = ['type' => 'free_agent', 'wage' => $free->ratings->wage_expectation, 'contract_years' => 2];
        $clubs = [$save->userClub, $this->gameClub($save, 'Beta FC')];

        $sign = fn ($club) => fn () => app(TransferService::class)->makeOffer($club->fresh(), $free->fresh(), $terms)->status;
        $results = $this->race([$sign($clubs[0]), $sign($clubs[1])]);

        sort($results);
        $this->assertSame(['completed', 'not_a_free_agent'], $results);
        $this->assertSame(1, GameTransfer::count());
        $this->assertSame(1, $free->contracts()->count());
        $this->assertSame(GameTransfer::sole()->to_club_id, $free->fresh()->game_club_id);
    }

    public function test_the_database_refuses_a_second_transfer_for_the_same_offer(): void
    {
        $save = $this->newSave();
        $player = $this->playerOf($this->gameClub($save, 'Beta FC'));
        app(TransferService::class)->makeOffer($save->userClub, $player, $this->fairTerms($player));
        $transfer = GameTransfer::sole();

        $this->expectExceptionMessage('game_transfers_game_transfer_offer_id_unique');
        GameTransfer::create($transfer->replicate()->getAttributes());
    }
}
