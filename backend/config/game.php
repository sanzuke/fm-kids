<?php

/* Rules of a game save's world. Money is whole coins. */
return [
    // a season runs from this day (month-day) to the day before it a year later
    'season_start' => '07-01',
    'first_season' => 2026,

    // starting money of a club: base + reputation * per_reputation
    'club_balance' => ['base' => 2000, 'per_reputation' => 150],
    // share of the balance a club may spend on transfer fees
    'transfer_budget_share' => 0.8,
    // wage budget = current wage bill * headroom + extra
    'wage_budget' => ['headroom' => 1.25, 'extra' => 200],

    // transfer windows of every season: name => [opens, closes] as month-day
    'transfer_windows' => [
        'summer' => ['07-01', '08-31'],
        'winter' => ['01-01', '01-31'],
    ],

    'contract_years' => ['min' => 1, 'max' => 5],
    'squad' => ['min' => 11, 'max' => 30],

    // how the computer-run side answers in a negotiation
    'negotiation' => [
        // asking price of a player who is not listed, as a multiple of market value
        'unlisted_premium' => 1.3,
        // fee for a loan of an unlisted player, as a share of market value
        'loan_fee_share' => 0.1,
        // a selling club counters a bid of at least this share of its asking price; lower bids are refused
        'seller_counter_from' => 0.7,
        // a buying club pays at most this multiple of market value
        'buyer_max_premium' => 1.2,
        // a player signs for at least this share of the wage they expect, and asks for the full wage otherwise
        'wage_accept_from' => 0.9,
        'wage_counter_from' => 0.6,
        // after this many rounds the computer side stops countering and refuses
        'max_rounds' => 4,
        // computer clubs that bid when a player is listed, and their opening bid as a share of the asking price
        'listing_bidders' => 2,
        'listing_bid_share' => 0.9,
        // seasons on the contract a computer club offers
        'cpu_contract_years' => 3,
    ],
];
