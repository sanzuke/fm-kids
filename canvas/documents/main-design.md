# Kids Football Manager — Main Design

## Fantasy & loop
Child manager of a small club. Loop: set lineup/tactics → train → play next fixture (watch animated 2D match) → earn coins/rep/trophies → buy/sell players → upgrade facilities → climb 3 league divisions + cup + tournament.

## Stack
Vite + TypeScript, React (menus/dashboards), Zustand (state, saved to localStorage), Phaser 3 (match pitch). Match logic (`src/engine`) is pure TS and separate from rendering (`src/match/MatchScene`).

## Screens
Splash, Main Menu, Create Club, Dashboard, Squad, Formation & Tactics (drag/drop), Match, Transfer Market, Player Profile, Training, League, Schedule, Finance, Trophy Room, Settings.

## Match
Real-time simulation of 22 agents + ball (formation positions, attack/defend shifts, pass/shoot/tackle/intercept, keeper dives, simple offside, goals, celebration, substitutions). Modes: Watch, Highlights, Quick. Speeds 1/2/4x, pause. Score and stats derive from the sim.

## Art / asset list
| Asset | Role | Source | Destination |
|---|---|---|---|
| Title key art (cartoon stadium + kids) | Splash/menu backdrop | generated | public/art/title.png |
| Player sprite frames (idle, run, walk, kick, shoot, tackle, celebrate, dive) with jersey tinting | Match players | procedural frame-based spritesheet drawn to canvas at boot (big-head cartoon) | Phaser texture |
| Pitch, ball, goals, UI icons/logos | Match + UI | code drawn / emoji-free SVG | runtime |

Note: sprite sheets are generated procedurally so every club jersey colour gets its own sheet; no external character art.

## Progression
Coins from wins, reputation, trophies, achievements, facilities (training, stadium, youth), promotion/relegation. No gambling or paid loot.

## Implementation notes
- Title key art generated (assets/generated → public/art/title.png), used by splash and menu.
- Players are procedural frame-based sprite sheets (8 anims, 29 frames) drawn per kit at runtime; logos, jerseys, avatars and cards are SVG. No mockup board was generated.
- Season: 3 divisions x 8 clubs, 14 league rounds + 4 cup rounds + 3 tournament rounds; promotion/relegation 2 up / 2 down.
- Real players: `npm run import:players` (needs `API_FOOTBALL_TOKEN`) writes `src/game/realPlayers.json` from API-Football; about 40% of newly generated players are then real ones matching position line, level and age, the rest stay invented. The game never calls the API at runtime.
- Real players in every season's market: the game copies the whole real-player catalogue into the save automatically the first time a season is opened, and copies it in again when a new season starts. Nothing is asked of the player — no account, no address, no button — and no coins are spent: every real player simply appears in **🔍 Scouting** at their real club, tagged **Real**, with the normal asking price, and is bought, loaned and sold through the ordinary deal flow, then trained, picked in Tactics and played like anyone else. The save records which season its catalogue came from (`catalogue`); a refresh updates ages, ratings, clubs, values and wages in place and adds newcomers, without ever moving a player the manager already owns (their growth belongs to the save). Matching is by `catalogId`; a save made before ids were stored adopts the generated player with the same name once, so a real footballer exists only once in a world. The Scouting banner just reports the count, the season and when it was last updated; if the backend is briefly away the game keeps trying on its own, so nothing needs to be clicked.
- One automatic catalogue, no server form: the Transfer Market has no **🌐 Online** tab and nothing in the game asks for a server address or an account to fill the market. The backend address belongs to the build (`VITE_API_URL`; the dev preview reaches the backend through its own dev server at the relative path `kfm/api`, so it also works behind an HTTPS tunnel) and is never read from an old saved value, and the catalogue endpoints are public. Copying a player in puts them at their real club (a club from abroad is added the first time one of its players arrives) and the normal transfer dialog follows; from that point they are ordinary players — fee negotiated, wage agreed, loans and sales under the same market rules as every generated player. Clubs from abroad never join the leagues, the cup draw, tournaments or CPU bids, and the CPU never tops up a real club's squad. A build without a backend simply says so in the Scouting banner and keeps playing with its own players.
- Backend (`backend/`): Laravel + PostgreSQL REST API with the hybrid player catalogue (API-Football sync + generated players), independent game saves and the transfer market. The game client reads the public `/players` catalogue without a token; the save, transfer-market and offer endpoints need a token and are ready for a hosted game mode that the local game does not use yet. See `backend/README.md` and `backend/docs/`.
- Two data layers, deliberately kept apart: the **global database** (`players`, `clubs`, `leagues`, `player_careers`) holds only the base profile and `base_*` ratings, is shared by every save and is never changed by play; the **game-world database** (`game_saves`, `game_clubs`, `game_players`, `game_player_attributes`, `game_player_contracts`, `game_finance_transactions`, `game_transfer_*`) copies a player into a save and owns everything play changes — club, current attributes, potential, market value, wage, contract, transfer and loan history. A save reads the catalogue, never writes it.
- One master identity, never two player databases: real and fictional players are rows of the same `players` table, told apart only by `origin`; `game_players` is their representation in one save. So a real player and an invented one share every rule and screen, an invented player can join a real club, a real player can grow with their in-game form, and the same catalogue player has a different rating in every save. Transfers, loans and free agents all read `game_players`, so the market has one mechanism. On the client the same rule holds: one `Player` type for everyone, and an online player keeps `catalogId` — their `players.id` — so the master identity survives in the save. Older local saves without it fall back to a name match, and the local browser save is the game-world layer for one player.
- Cloud saves: Settings → **☁️ Cloud saves** keeps the whole playthrough on the server under a name of its own (optional sign-in, used only for cloud saves). It stores the game's world document in `game_saves.world`, next to the shared catalogue and separate from every other save; the server also mirrors the season, club name and player count so the save list stays small. A user can keep several cloud saves, only the owner can load or delete one, and loading replaces the local save with that world. This is the first step of hosted play: it makes saves multi-save and multi-user, while the structured `game_*` tables remain the target shape for server-run transfers.
