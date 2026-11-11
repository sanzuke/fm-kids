# API

Base URL: `/api`. JSON in, JSON out. Send `Accept: application/json`.

## Health

### GET `/health`

Public, no token. `{"data": {"status": "ok" | "degraded", "database": "ok" | "unavailable",
"version": ...}}`, with 200 when the database answers and 503 when it does not. The game checks
this before asking anyone to sign in, so a stopped backend reads as "server offline".

## Conventions

- **Authentication**: `Authorization: Bearer <token>` on everything except health, register,
  login and the read-only catalogue (`/clubs`, `/players`, `/players/{id}`). The catalogue is
  public because the game fills a save's market from it before anyone signs in; it is throttled
  to 120 requests a minute. Signing in is only needed for a user's own saves, offers and
  transfer actions.
- **Single object**: `{"data": {...}}`.
- **List**: `{"data": [...], "links": {...}, "meta": {"current_page", "last_page", "per_page", "total"}}`.
  Use `page` and `per_page` (1–100, default 25).
- **Errors**:

  | Status | Body | When |
  |---|---|---|
  | 401 | `{"message"}` | no or invalid token |
  | 403 | `{"message"}` or `{"message", "code"}` | not your save, or not your player/offer |
  | 404 | `{"message"}` | unknown id |
  | 409 | `{"message", "code"}` | conflicts with the current state (offer closed, duplicate) |
  | 422 | `{"message", "errors": {field: [..]}}` | invalid input |
  | 422 | `{"message", "code"}` | a game rule refused it |

- Money is whole coins. Dates are `YYYY-MM-DD` in game time.
- In a save the user always acts for the club they manage.

## Authentication

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/auth/register` | `name`, `email`, `password` (min 8) | 201 `{data: {user, token}}` |
| POST | `/auth/login` | `email`, `password` | 200 `{data: {user, token}}` |

## Catalogue

### GET `/players`

Real and fictional players of the shared catalogue. Public: no token needed.

| Query | Meaning |
|---|---|
| `search` | part of the name |
| `position` | `GK CB LB RB CDM CM CAM LW RW ST`; matches primary or secondary position |
| `origin` | `real` or `fictional` |
| `nationality` | country code (`IDN`) or name |
| `min_age`, `max_age` | age today |
| `min_rating`, `max_rating` | overall |
| `min_potential`, `max_potential` | potential |
| `min_price`, `max_price` | market value |
| `club_id` | catalogue club |
| `sort` | `overall` (default), `potential`, `price`, `age`, `name` |
| `direction` | `desc` (default) or `asc` |

Item: `id, name, origin, age, birth_date, nationality {code, name}, club {id, name}, position,
secondary_positions, preferred_foot, personality, height_cm, overall, potential,
attributes {speed, shooting, passing, dribbling, defending, stamina}, market_value, wage, photo`.

### GET `/players/{id}`

The same item plus `external_ids [{provider, id}]` and `career` (season statistics and transfers).

### GET `/clubs`

Clubs a save can be started with: `id, name, league, is_fictional, reputation, players`.

## Game saves

### GET `/game-saves`

The signed-in user's saves, newest first. Item: `id, name, mode` (`structured` or `cloud`),
`season, game_date, club {id, club_id, name, balance, transfer_budget, wage_budget, wage_bill},
transfer_window {name, closes_on} | null, world {version, players} | null, created_at,
updated_at`. The list never includes a cloud save's world document.

### POST `/game-saves`

Two shapes:

- Structured: `name` (unique per user), `club_id` (catalogue club to manage). Copies the
  catalogue into `game_clubs`/`game_players`.
- Cloud: `name` and `world` (the game's own world document: `v`, `seed`, `season`, `userClub`,
  `clubs`, `players`, plus fixtures, tables, tactics and everything else the client keeps).
  Stored whole in `game_saves.world`, with `world_version`, `world_players` and `world_club`
  mirroring it so lists stay small. No catalogue data is written.

→ 201 with the save. Errors: 409 `duplicate_save_name`, 422 when neither shape is valid.

### GET `/game-saves/{id}/world`

A cloud save's world document, exactly as the game wrote it:
`id, name, season, world_version, updated_at, world`. 404 for a structured save.

### PUT `/game-saves/{id}/world`

Body: `world` (same shape as above). Replaces the document and its summary columns; the save
keeps its id and name. 404 for a structured save.

### DELETE `/game-saves/{id}`

Deletes a cloud save. 404 for a structured save: those are owned by the structured game-world
endpoints, not by the cloud-save one.

### GET `/game-saves/{id}/players`

Every player of the save with the save's own state. Same filters as `/players` (ages on the
save's date, `club_id` is a game club id), plus `availability` = `listed` or `free_agents`.
`price` is the asking price of a listed player and the market value of anyone else.

Item: `id` (game player id), `player_id` (catalogue id), `name, origin, age, nationality,
position, secondary_positions, preferred_foot, club {id, name} | null, is_free_agent,
squad_number, overall, potential, attributes, market_value, wage_expectation,
contract {wage, ends_on} | null, listing {id, type, asking_price} | null,
on_loan {parent_club_id, ends_on} | null, price`.

## Transfer market

### GET `/game-saves/{id}/transfer-market`

As the previous endpoint, without the user's own squad. `meta.transfer_window_open` says
whether transfers and loans are possible now.

### GET `/game-saves/{id}/transfer-market/{playerId}`

`playerId` is the **game player id**. Result: `player` (item as above), `asking_price` (what the
club wants; 0 for a free agent), `loan_fee`, `expected_wage`, and `offers` the user's club made
or received for this player.

### POST `/game-saves/{id}/transfer-listings`

Put one of your players on the market. Body: `game_player_id`, `asking_price` (≥ 1), `type`
(`transfer` default, or `loan`). → 201 `id, type, status, asking_price, listed_on, player, club,
offers` — `offers` holds the bids computer clubs made at once (none outside a window; they
arrive when one opens).
Errors: 403 `not_your_player`, 409 `already_listed`, 422 `player_on_loan`.

### GET `/game-saves/{id}/transfer-offers`

Offers the user's club made or received. Query: `status`, `direction` (`incoming` | `outgoing`).

### POST `/game-saves/{id}/transfer-offers`

| Field | |
|---|---|
| `game_player_id` | required |
| `type` | `transfer`, `loan` or `free_agent` |
| `fee` | required for transfer and loan |
| `wage`, `contract_years` (1–5) | required for transfer and free agent |
| `loan_ends_on` | required for loan; after today, not after the player's contract ends |

The other side answers at once, so the 201 response already shows the outcome:

- `status: completed` — done; the player is yours.
- `status: pending`, `your_turn: true` — countered: `fee` (club) or `wage` (player) now holds
  what they ask. Accept, counter or reject it.
- `status: rejected` — see `closing_note`.

Offer: `id, type, status, awaiting, your_side, your_turn, fee, wage, contract_years,
loan_ends_on, player_agreed, rounds, closing_note, offered_on, closed_on, player, buying_club,
selling_club | null, transfer_id, negotiation [{step, side, action, fee?, wage?, contract_years?, note?}]`.

### POST `/transfer-offers/{id}/accept`

Agree to the terms on the table. Completes the deal, unless the player still has to agree and
asks for a better wage (then the offer comes back `pending` with their wage).

### POST `/transfer-offers/{id}/reject`

Body: optional `note`. As the seller the offer becomes `rejected`, as the buyer `withdrawn`.

### POST `/transfer-offers/{id}/counter`

As the seller: `fee`. As the buyer: `fee`, `wage`, `contract_years` (transfer); `wage`,
`contract_years` (free agent); `fee`, `loan_ends_on` (loan). The other side answers at once.

### GET `/game-saves/{id}/transfer-history`

Completed moves, newest first. Query: `type` (`transfer`, `loan`, `free_agent`, `loan_return`),
`club_id`, `game_player_id`. Item: `id, type, fee, wage, season, date, player {id, name, origin},
from_club | null, to_club, offer_id`.

## Game rule codes

| Code | Status | Meaning |
|---|---|---|
| `insufficient_funds` | 422 | the buying club's balance is too low |
| `insufficient_budget` | 422 | the transfer budget is too low |
| `wage_budget_exceeded` | 422 | the wage does not fit the wage budget |
| `window_closed` | 422 | transfers and loans need an open window |
| `player_on_loan` | 422 | a loaned player cannot move or be listed |
| `invalid_loan` | 422 | loan end date out of range |
| `invalid_contract` | 422 | contract length or wage out of range |
| `invalid_counter` | 422 | that term cannot be changed here |
| `already_yours` | 422 | the player is at your club |
| `not_a_free_agent` / `player_is_free_agent` | 422 | wrong offer type for the player |
| `squad_full` / `squad_too_small` | 422 | squad limits (11–30) |
| `no_contract` | 422 | no running contract to buy out |
| `not_your_player` / `not_your_offer` | 403 | your club is not involved |
| `not_your_turn` | 409 | the offer waits for the other side |
| `offer_closed` | 409 | the offer was completed, rejected or withdrawn |
| `player_not_owned` | 409 | the player left the selling club meanwhile |
| `duplicate_offer` | 409 | you already have an open offer for the player |
| `already_listed` | 409 | the player is already on the market |
| `duplicate_save_name` | 409 | you already have a save with that name |
