<?php

namespace App\Jobs;

use App\Exceptions\ApiRateLimitedException;
use App\Models\SyncLog;
use App\Services\Football\ApiFootballImporter;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Base for API-Football sync jobs: writes a sync log, waits out rate limits by putting the
 * job back on the queue, and retries other failures a few times with a growing pause.
 */
abstract class SyncJob implements ShouldQueue
{
    use Queueable;

    public int $maxExceptions = 3;

    /** @var list<int> seconds before each retry after a failure */
    public array $backoff = [30, 120, 600];

    /** Waiting for a quota to reset can take until tomorrow, so the job is limited by time, not tries. */
    public function retryUntil(): \DateTimeInterface
    {
        return now()->addDays(2);
    }

    abstract protected function resource(): string;

    /** @return array<string, mixed> */
    abstract protected function params(): array;

    abstract protected function sync(ApiFootballImporter $importer): void;

    public function handle(ApiFootballImporter $importer): void
    {
        $log = SyncLog::create([
            'provider' => config('football.provider'), 'resource' => $this->resource(),
            'params' => $this->params(), 'status' => 'running', 'started_at' => now(),
        ]);

        try {
            $this->sync($importer);
            $this->finish($log, $importer, 'success');
        } catch (ApiRateLimitedException $e) {
            $this->finish($log, $importer, 'rate_limited', $e->getMessage());
            $this->release($e->retryAfter);
        } catch (Throwable $e) {
            $this->finish($log, $importer, 'failed', $e->getMessage());
            throw $e;
        }
    }

    private function finish(SyncLog $log, ApiFootballImporter $importer, string $status, ?string $error = null): void
    {
        $log->update([
            'status' => $status, 'error' => $error, 'finished_at' => now(),
            'records_created' => $importer->counts['created'], 'records_updated' => $importer->counts['updated'],
        ]);
    }
}
