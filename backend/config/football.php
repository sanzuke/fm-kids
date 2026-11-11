<?php

/*
| API-Football (https://www.api-football.com) synchronisation.
| The key is read on the server only; no route or resource ever returns it.
*/
return [
    'provider' => 'api-football',
    'base_url' => env('API_FOOTBALL_URL', 'https://v3.football.api-sports.io'),
    'key' => env('API_FOOTBALL_TOKEN', env('API_FOOTBALL_KEY')),

    // leagues the scheduled sync follows, as API-Football league ids, and the season's starting year.
    // `football:sync --current` ignores the season and uses the one running today. Each league
    // costs a handful of requests (one per club page), so add leagues up to the plan's daily quota.
    'leagues' => array_values(array_filter(array_map('intval', explode(',', (string) env('API_FOOTBALL_LEAGUES', '39'))))),
    'season' => (int) env('API_FOOTBALL_SEASON', 2024),

    // the free plan allows 10 requests a minute and only the first 3 pages of a search
    'requests_per_minute' => (int) env('API_FOOTBALL_PER_MINUTE', 10),
    'max_pages' => (int) env('API_FOOTBALL_MAX_PAGES', 3),

    'timeout' => 15,
    // tries for connection errors and 5xx answers, and the wait before each retry in milliseconds
    'retries' => 3,
    'retry_wait_ms' => 500,

    // overall rating from an average match rating: 6.0 -> 45, 7.0 -> 68, 8.0 -> 91
    // a rating from fewer minutes than this says too little, and the player counts as unrated
    'min_minutes' => 270,
    'rating' => ['pivot' => 6.0, 'overall_at_pivot' => 45, 'per_point' => 23, 'min' => 30, 'max' => 92, 'unrated' => 55],

    // the API only names a line; the exact position is spread over these by player id
    'positions' => [
        'Goalkeeper' => ['GK'],
        'Defender' => ['CB', 'LB', 'CB', 'RB'],
        'Midfielder' => ['CM', 'CDM', 'CM', 'CAM'],
        'Attacker' => ['ST', 'LW', 'ST', 'RW'],
    ],
];
