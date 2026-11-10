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
