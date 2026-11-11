// Fetches real players from API-Football and writes src/game/realPlayers.json,
// which is bundled with the game. Run it on your own machine; the key never ships.
//
//   API_FOOTBALL_TOKEN=xxxx npm run import:players -- --leagues 39,140,274 --season 2024
//
// --leagues  API-Football league ids (39 Premier League, 140 La Liga, 135 Serie A,
//            78 Bundesliga, 61 Ligue 1, 274 Liga 1 Indonesia). Default: 39
// --season   starting year of the season. Default: 2024
// --pages    most pages to fetch per club (20 players a page). Default: 3, the free plan's limit
//
// Responses are cached in scripts/.cache, so a run that stops at the daily limit
// continues from where it stopped when started again.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'src', 'game', 'realPlayers.json');
const CACHE = join(here, '.cache');
const WAIT_MS = 6500; // the free plan allows 10 requests a minute

// nations the game has a flag for; anyone else gets a flag from the game's usual rule
const NATION_CODES = {
  Indonesia: 'IDN', Brazil: 'BRA', Argentina: 'ARG', England: 'ENG', Spain: 'ESP', France: 'FRA', Germany: 'GER',
  Italy: 'ITA', Netherlands: 'NED', Japan: 'JPN', Nigeria: 'NGA', Belgium: 'BEL', Colombia: 'COL', Sweden: 'SWE',
};
const LINES = { Goalkeeper: 'G', Defender: 'D', Midfielder: 'M', Attacker: 'A' };
const MIN_MINUTES = 270;

/** One API player entry -> [name, line, age, overall, nation code], or null when there is too little to go on. */
export function toRow(entry) {
  const p = entry.player ?? {};
  const stats = (entry.statistics ?? []).filter((s) => s.games?.rating);
  if (!stats.length || !p.name || !p.age) return null;
  const s = stats.reduce((a, b) => ((b.games.minutes ?? 0) > (a.games.minutes ?? 0) ? b : a));
  const line = LINES[s.games.position];
  if (!line || (s.games.minutes ?? 0) < MIN_MINUTES) return null;
  // match rating 6.0 -> 45, 7.0 -> 68, 8.0 -> 91
  const ovr = Math.max(30, Math.min(92, Math.round(45 + (Number(s.games.rating) - 6) * 23)));
  // the API's short name is the one fans know ("Mohamed Salah", "Kepa"); only spell out an initial ("P. Foden")
  const short = /^(\p{L})\. (.+)$/u.exec(p.name);
  const firsts = (p.firstname ?? '').split(' ').filter(Boolean);
  const name = short && firsts.length ? `${firsts.find((f) => f.startsWith(short[1])) ?? firsts[0]} ${short[2]}` : p.name;
  return [name, line, p.age, ovr, NATION_CODES[p.nationality] ?? ''];
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function main() {
  const key = process.env.API_FOOTBALL_TOKEN ?? process.env.API_FOOTBALL_KEY;
  if (!key) {
    console.error('Set API_FOOTBALL_TOKEN to your API-Football key first.');
    process.exit(1);
  }
  const leagues = arg('leagues', '39').split(',').map((x) => x.trim()).filter(Boolean);
  const season = arg('season', '2024');
  const maxPages = Number(arg('pages', '3'));
  mkdirSync(CACHE, { recursive: true });

  /** One API call, answered from the cache when it was made before. Throws with the API's own message. */
  async function get(path, cacheName) {
    const file = join(CACHE, `${cacheName}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
    const res = await fetch(`https://v3.football.api-sports.io/${path}`, { headers: { 'x-apisports-key': key } });
    const body = await res.json().catch(() => null);
    const errors = body?.errors && (Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors).length) ? JSON.stringify(body.errors) : '';
    if (!res.ok || !body || errors) throw new Error(`${path}: ${errors || `HTTP ${res.status}`}`);
    writeFileSync(file, JSON.stringify(body));
    await sleep(WAIT_MS);
    return body;
  }

  const rows = new Map();
  let stopped = '';
  try {
    for (const league of leagues) {
      // club by club: the free plan only serves the first 3 pages of any one search
      const teams = (await get(`teams?league=${league}&season=${season}`, `teams-${league}-${season}`)).response ?? [];
      for (const [i, t] of teams.entries()) {
        let pages = maxPages;
        for (let page = 1; page <= pages; page++) {
          const body = await get(`players?team=${t.team.id}&season=${season}&page=${page}`, `players-team-${t.team.id}-${season}-${page}`);
          pages = Math.min(maxPages, body.paging?.total ?? 1);
          for (const entry of body.response ?? []) {
            const row = toRow(entry);
            if (row && !rows.has(row[0])) rows.set(row[0], row);
          }
          process.stdout.write(`\rleague ${league}: club ${i + 1}/${teams.length}, ${rows.size} players `);
        }
      }
      process.stdout.write('\n');
    }
  } catch (e) {
    stopped = e.message;
  }
  if (stopped) console.warn(`\nStopped early at ${stopped}\nRun the same command again later to continue.`);
  if (!rows.size) {
    console.error('No players fetched; src/game/realPlayers.json was left as it is.');
    process.exit(1);
  }
  const list = [...rows.values()].sort((a, b) => b[3] - a[3]);
  writeFileSync(OUT, `[\n${list.map((x) => JSON.stringify(x)).join(',\n')}\n]\n`);
  console.log(`Wrote ${list.length} players to src/game/realPlayers.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
