<?php

use Illuminate\Support\Facades\Schedule;

// Refresh real players once a day, when an API key is configured. `--current` moves the
// catalogue on to the running season by itself, so a new season updates the same players in
// place instead of adding copies of them.
Schedule::command('football:sync --current')->dailyAt('03:30')->withoutOverlapping()->when(fn () => (bool) config('football.key'));
