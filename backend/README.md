# Kids Football Manager — backend

Laravel 13 + PostgreSQL REST API for the hybrid player database (real players from
API-Football next to generated fictional ones), independent game saves and the transfer market.

- [docs/MODULES.md](docs/MODULES.md) — what each module does and where its code is
- [docs/ERD.md](docs/ERD.md) — database diagram and the constraints that guard it
- [docs/API.md](docs/API.md) — every endpoint with parameters, responses and error codes

The browser game in the parent folder fills its transfer market from this API automatically:
the catalogue endpoints (`/clubs`, `/players`) are public, so no account or server address is
needed. Each season the game copies the real-player catalogue into the local save at each
player's real club, and the ordinary transfer market takes over — the fee is negotiated, the
wage agreed, and loans and sales follow the same rules as generated players. An account is
optional and only keeps **☁️ Cloud saves** (Settings): a whole playthrough is stored as one world
document in `game_saves.world`, so a user can hold several saves and only they can open them.
The rest of the game still keeps its state in the browser, and the structured save and
transfer-market endpoints are not called by the game yet.
Publishing the game does not publish this backend, which needs its own host; CORS already
allows any origin for `api/*`.

The game finds the server at `VITE_API_URL` when it is built (`VITE_API_URL=https://api.example.com/api npm run build`),
so a published build already knows its backend and the player only signs in. The address field
in Settings → 🌐 Server account is hidden behind **Use another server** for developers. The
development preview reaches port 8000 through its own dev server (the relative path `kfm/api`,
proxied in `vite.config.ts`), so `docker compose up -d app` is enough to try it, also when the
preview is opened through an HTTPS tunnel. A build without `VITE_API_URL` has no online features and says so in Settings.

## Requirements

Docker with Compose. PHP, Composer and PostgreSQL run in containers, so nothing else is needed
on the machine. (Without Docker: PHP 8.3+ with `pdo_pgsql`, `mbstring`, `xml`, `curl`, `pcntl`,
Composer 2 and PostgreSQL 14+; put the database settings in `.env`.)

## Installation

```sh
cd backend
cp .env.example .env                 # skip if .env exists
./kfm composer install               # ./kfm runs a command in the PHP container
./kfm php artisan key:generate       # skip if APP_KEY is set
./kfm php artisan migrate --seed     # tables + the fictional leagues, clubs and players
docker compose up -d app             # API on http://localhost:8000/api
```

`migrate --seed` creates 3 fictional leagues, 24 clubs, 384 squad players and 45 free agents.
Running the seeder again adds nothing.

Stop everything with `docker compose down` (add `-v` to delete the database as well).
Containers use `restart: unless-stopped`, so they come back after a reboot or a Docker restart;
`GET /api/health` is the public check the game uses to tell "server online" from "server down".

## Tests

```sh
./kfm php artisan test
```

The tests use the separate `kfm_test` database on the same PostgreSQL server (created when the
database container first starts) and never call the real API.

## Synchronising real players from API-Football

1. Put the key in the environment as `API_FOOTBALL_TOKEN`. Compose passes the variable from
   your shell into the containers, so exporting it in `~/.bashrc` is enough; alternatively set
   it in `backend/.env`. The key is only read on the server: no endpoint returns it.
2. Choose leagues and season in `.env`:

   ```
   API_FOOTBALL_LEAGUES=39,140     # API-Football league ids
   API_FOOTBALL_SEASON=2024        # starting year of the season
   ```

   The daily schedule uses `--current`, so from one season to the next nothing in `.env` has to
   change; `API_FOOTBALL_SEASON` is only the fallback for a manual `football:sync`.

3. Queue a sync and let a worker run it:

   ```sh
   ./kfm php artisan football:sync                       # the configured leagues
   ./kfm php artisan football:sync --current             # the season running today
   ./kfm php artisan football:sync --league=61 --season=2024 --transfers
   docker compose up -d queue                            # processes the queued jobs
   ```

   `--transfers` also fetches each player's transfer history (one more request per player).

4. For a daily refresh at 03:30, keep the scheduler running: `docker compose up -d scheduler`.

What to expect:

- One league costs about 62 requests on the free plan (1 league + 1 club list + up to 3 pages
  for each of 20 clubs). The free plan allows 100 requests a day and 10 a minute.
- When a limit is reached the job waits on the queue and continues by itself after the limit
  resets; nothing has to be restarted.
- Syncing again updates the existing players. No duplicates are created, and running game
  saves keep their own attributes, contracts and progress.
- Every job writes a row to `sync_logs` (`success`, `rate_limited` or `failed` with the error):

  ```sh
  ./kfm php artisan tinker --execute='dump(App\Models\SyncLog::latest("id")->take(10)->get(["resource","params","status","records_created","records_updated","error"])->toArray());'
  ```

- A running save copies the catalogue into itself the first time each season is opened (Scouting
  shows the count and when it was last refreshed) and copies it in again when the next season
  starts, so players synced later still reach saves that already exist. Nothing the manager owns
  is moved or recalculated by that refresh.

Settings for the sync are in `config/football.php`, for the generator in
`config/player_generator.php` and for the game rules in `config/game.php`.
