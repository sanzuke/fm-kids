# Modules

## 1. Player database

Shared catalogue, never changed by play.

| Table | Purpose |
|---|---|
| `countries`, `leagues`, `clubs` | Reference data. Leagues and clubs from an API carry `provider` + `external_id` (unique together). |
| `players` | One row per player, real or fictional (`origin`). Holds the profile and the *base* ratings a new save starts from. There is no separate table per origin: a real player and an invented one differ only in this column. |
| `player_external_ids` | Link from a player to a record at an external provider. Unique on (`provider`, `external_id`), so a record cannot be imported twice. |
| `player_careers` | Real-world history: season statistics (`kind = season`) and transfers (`kind = transfer`). |
| `player_photos` | Photo URLs. |
| `sync_logs` | One row per synchronisation job. |

Code: `app/Models/{Country,League,Club,Player,PlayerExternalId,PlayerCareer,PlayerPhoto,SyncLog}.php`,
migration `2026_11_11_000001`. Search and filters: `Player::scopeFilter()` (name, position
including secondary positions, origin, nationality, age range); name search uses a trigram index.

## 2. Player generator

`App\Services\Players\PlayerGenerator` invents fictional players: name, nationality, age,
primary and secondary positions, six attributes shaped by position, overall, potential, market
value, wage, personality and preferred foot. Every choice is drawn from the weighted lists in
`config/player_generator.php`. A seed makes the output repeatable.

Its rating maths (`attributesFor`, `overallFor`, `marketValue`, `wageFor`) is also used for
imported real players, so both origins are rated on the same scale. Positions and attribute
weights are the ones the game's match engine uses.

Seeder: `database/seeders/FictionalWorldSeeder.php`.

## 3. API-Football integration

| Class | Role |
|---|---|
| `Services\Football\ApiFootballService` | HTTP client: leagues, clubs, players with statistics, one player's profile, transfer history. Sends the key as a header, retries connection errors and 5xx answers, keeps a per-minute limit and remembers a used-up daily quota. |
| `Services\Football\ApiFootballImporter` | Maps answers into the catalogue. Finds existing rows by external id and updates them. Writes catalogue tables only. |
| `Jobs\SyncLeagueJob`, `SyncClubPlayersJob`, `SyncPlayerTransfersJob` | Queue jobs. A rate-limited job goes back on the queue for the time the API asks; other failures are retried after 30 s, 2 min and 10 min. Each run is logged. |
| `Console\Commands\SyncFootball` | `php artisan football:sync`, also scheduled daily in `routes/console.php` with `--current` so each new season refreshes the same players in place. |

How real data becomes game data:

- **Overall** comes from the season's average match rating (6.0 → 45, 7.0 → 68, 8.0 → 91). With
  fewer than 270 minutes played the player counts as unrated and gets 55.
- **Position**: the API only gives a line (goalkeeper, defender, midfielder, attacker). The exact
  position within the line is spread by player id, so it is a game choice, not a fact.
- **Attributes, potential, value, wage** are worked out by the generator's maths from the
  overall, position and age.

## 4. Game world

Per-save state. Every `game_*` row belongs to exactly one `game_saves` row.

Two shapes share the table. A **structured** save copies the catalogue into `game_clubs` and
`game_players`; a **cloud** save stores the browser game's whole world document in
`game_saves.world` (`is_cloud = true`), with `world_version`, `world_players` and `world_club`
mirroring it so the save list never reads the document. Cloud saves exist because the
structured tables do not model fixtures, tables, tactics or competitions yet; both shapes stay
outside the catalogue, and both are scoped to their owner.

| Table | Purpose |
|---|---|
| `game_saves` | A playthrough of one user: season, date, the club they manage. |
| `game_clubs` | A catalogue club inside a save, with balance, transfer budget and wage budget. |
| `game_players` | A catalogue player inside a save: current club (null = free agent), shirt number. Same structure for real and fictional players. |
| `game_player_attributes` | The save's own ratings, value, wage expectation, morale, fitness. |
| `game_player_development` | History of attribute changes. |
| `game_player_contracts` | Contracts; at most one `active` per player. |
| `game_finance_transactions` | Ledger: every balance change with the balance after it. |

Services (`app/Services/Game`):

- `GameWorldService::createSave()` copies the catalogue into a new save with set-based SQL;
  `advanceTo()` moves the calendar, returns finished loans, ends expired contracts and opens or
  closes transfer windows.
- `FinanceService::record()` is the only code that changes a balance.
- `ContractService` signs, renews, releases and expires contracts.
- `SquadService` lists squads and assigns shirt numbers.
- `DevelopmentService::apply()` changes attributes and records the change.

A season runs 1 July – 30 June; contracts end on 30 June.

## 5–6. Transfer market

| Table | Purpose |
|---|---|
| `game_transfer_windows` | Summer (1 Jul – 31 Aug) and winter (1 – 31 Jan) window per season. |
| `game_transfer_listings` | Players a club put on the market, for sale or loan. |
| `game_transfer_offers` | An offer and the terms now on the table; `awaiting` says whose answer is due. |
| `game_transfer_negotiations` | Every step said in a negotiation. |
| `game_transfers` | Completed moves (transfer, loan, free agent, loan return). |
| `game_loan_agreements` | Running and finished loans. |

Services (`app/Services/Transfers`):

- `TransferService` — list a player, make an offer, accept, reject, counter, and complete a deal.
- `TransferNegotiator` — the computer-run side. Fixed rules from `config/game.php`:
  - a selling club accepts its asking price (the listing price, or 130 % of market value when
    not listed), counters bids from 70 % of it by meeting in the middle, refuses lower bids,
    and gives up after 4 rounds;
  - a player accepts from 90 % of the wage they expect, asks for the full wage from 60 %, and
    refuses below that;
  - a buying club pays up to 120 % of market value, within its balance and transfer budget;
  - when the user lists a player during a window, up to 2 computer clubs bid 90 % of the price.
- `TransferMarketService` — windows, the market search and clean-up when the calendar moves.

The user plays one club per save. Deals between two computer clubs are not simulated.

**Completing a deal** (`TransferService::complete`) is one database transaction that: checks the
offer is open; checks the buyer's balance, transfer budget and squad room; checks the player is
still at the selling club (or still a free agent) and the seller keeps at least 11 players;
checks window, loan and contract conditions; stores the transfer; debits the buyer and credits
the seller with ledger lines; moves the player; ends the old contract and signs the new one (or
creates the loan agreement); marks the listing sold; refuses other open offers for the player;
marks the offer completed. If any check fails, nothing is changed.

**Concurrency**: every operation first locks the player's row, so requests about one player run
one after the other; clubs are locked in id order. Unique constraints back this up (one
transfer per offer, one active contract, listing and loan per player, one open offer per club
and player).

Free agents can be signed at any time; transfers and loans need an open window.

## 7. API

Controllers in `app/Http/Controllers/Api`, validation in `app/Http/Requests`, output in
`app/Http/Resources`, routes in `routes/api.php`. See [API.md](API.md).

## 8. Tests

| File | Covers |
|---|---|
| `tests/Unit/PlayerGeneratorTest.php` | Fictional generation, weighted distributions, position realism. |
| `tests/Feature/PlayerDatabaseTest.php` | Seeder, duplicate external ids, constraints, search and filters. |
| `tests/Feature/ApiFootballSyncTest.php` | Real player import, no duplicates on re-sync, retries, rate limits, logs. |
| `tests/Feature/GameWorldTest.php` | Save creation, save isolation, sync not touching saves, money, contracts and their expiry. |
| `tests/Feature/TransferServiceTest.php` | Negotiation, completion, insufficient balance, ownership, loans, free agents, expiry. |
| `tests/Feature/ConcurrentTransferTest.php` | Simultaneous requests from separate processes. |
| `tests/Feature/ApiTest.php` | Endpoints: authentication, authorisation, validation, pagination, full buy/sell/loan flows. |
