import type { Pos } from './types';
import type { Rng } from './data';
import data from './realPlayers.json';

// Real footballers mixed in with the invented ones. The list is written by
// `npm run import:players` (scripts/import-real-players.mjs) from API-Football and bundled
// with the game, so the game itself never calls the API. An empty list means invented players only.

/** [name, line (G/D/M/A), age, overall, nation code or ''] */
type Row = [string, string, number, number, string];
const ROWS = data as unknown as Row[];

/** share of new players that are real ones, when a fitting one is free */
const REAL_SHARE = 0.4;
/** how far a real player's overall may be from the level the club asked for */
const OVR_WINDOW = 5;

const LINE: Record<Pos, string> = { GK: 'G', CB: 'D', LB: 'D', RB: 'D', CDM: 'M', CM: 'M', CAM: 'M', LW: 'A', RW: 'A', ST: 'A' };
const NAT = new Map(ROWS.filter((x) => x[4]).map((x) => [x[0], x[4]]));

export interface RealPick {
  name: string;
  age: number;
  ovr: number;
}

/** A real player for this position, level and age range who is not in the game yet, or null to invent one. */
export function pickReal(r: Rng, pos: Pos, target: number, minAge: number, maxAge: number, used: Set<string>): RealPick | null {
  if (!ROWS.length || r() >= REAL_SHARE) return null;
  const line = LINE[pos];
  const fit = ROWS.filter((x) => x[1] === line && x[2] >= minAge && x[2] <= maxAge && Math.abs(x[3] - target) <= OVR_WINDOW && !used.has(x[0]));
  if (!fit.length) return null;
  const [name, , age, ovr] = fit[Math.floor(r() * fit.length)];
  return { name, age, ovr };
}

/** Nation code of a real player, by name. */
export const realNation = (name: string) => NAT.get(name);
