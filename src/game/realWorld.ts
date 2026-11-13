// A new world built around a real league: the manager takes over one of its clubs, with the
// squad the catalogue lists for it, and the league's other clubs are the opponents.
//
// The season format stays the game's own (three divisions of eight, promotion and relegation),
// so a real league of 18 to 20 clubs is spread over the divisions by squad strength: the
// strongest eight start in the Gold League, the next eight in the Silver League, and the rest
// share the Bronze League with a few invented clubs.
import type { Club, FormationId, Player, Pos } from './types';
import type { ServerPlayer } from '../api/server';
import { CPU_NAMES, ICONS, PALETTE, SQUAD_SHAPE, clamp, makePlayer, mulberry, ri, type Rng, type WorldInit } from './data';
import { FORMATION_IDS } from './formations';
import { toLocalPlayer } from './serverPlayers';
import type { NewClubInput } from './world';

/** The real club a new game starts with, and the clubs of its league. */
export interface RealStart {
  club: string;
  league: string;
  leagueClubs: string[];
}

const DIVS = 3;
const DIV_SIZE = 8;
/** the manager's first-team limit (MAX_SQUAD); the rest of a big real squad starts as free agents */
const USER_SQUAD = 24;
const CPU_MIN = 16;
const key = (name: string) => name.trim().toLowerCase();

function nameHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Average overall of the best eleven, or null when the catalogue has too few players to tell. */
function strength(squad: ServerPlayer[]): number | null {
  if (squad.length < 11) return null;
  const top = squad.map((p) => p.overall).sort((a, b) => b - a).slice(0, 11);
  return top.reduce((s, v) => s + v, 0) / top.length;
}

/** The players the manager starts with: the best of the real squad, with two goalkeepers when it has them. */
function firstTeam(squad: ServerPlayer[]): Set<number> {
  const sorted = squad.slice().sort((a, b) => b.overall - a.overall);
  const keepers = sorted.filter((p) => p.position === 'GK');
  const chosen = new Set(keepers.slice(0, 2).map((p) => p.id));
  let keeperCount = chosen.size;
  for (const p of sorted) {
    if (chosen.size >= USER_SQUAD) break;
    if (chosen.has(p.id)) continue;
    if (p.position === 'GK' && keeperCount >= 3) continue;
    if (p.position === 'GK') keeperCount++;
    chosen.add(p.id);
  }
  return chosen;
}

export function createRealWorld(seed: number, user: NewClubInput, start: RealStart, catalogue: ServerPlayer[]): WorldInit {
  const r = mulberry(seed);
  const squads = new Map<string, ServerPlayer[]>();
  for (const name of start.leagueClubs) squads.set(key(name), []);
  for (const sp of catalogue) {
    const squad = sp.club?.name ? squads.get(key(sp.club.name)) : undefined;
    if (squad) squad.push(sp);
  }

  // rank the league by squad strength; a club the catalogue knows too little about sits in the middle
  const known = [...squads.values()].map(strength).filter((s): s is number => s !== null).sort((a, b) => a - b);
  const median = known.length ? known[Math.floor(known.length / 2)] : 55;
  const ranked = start.leagueClubs
    .map((name) => ({ name, level: strength(squads.get(key(name))!) ?? median }))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const mine = ranked.findIndex((c) => key(c.name) === key(start.club));
  const field = ranked.slice(0, DIVS * DIV_SIZE);
  if (mine >= field.length) field[field.length - 1] = ranked[mine];

  const clubs: Club[] = [];
  const levels = new Map<number, number>();
  const realNames = new Map<number, string>();
  const formations = FORMATION_IDS as FormationId[];
  const rep = (div: number, place: number) => [62, 40, 22][div] + 8 - place * 2;

  const userAt = field.findIndex((c) => key(c.name) === key(start.club));
  const userDiv = Math.min(DIVS - 1, Math.floor(userAt / DIV_SIZE));
  clubs.push({
    id: 0, name: user.name, icon: user.icon, color: user.color, color2: user.color2, awayColor: user.awayColor, awayColor2: user.awayColor2,
    div: userDiv, rep: rep(userDiv, userAt % DIV_SIZE), stadium: user.stadium, formation: '4-4-2', isUser: true,
  });
  levels.set(0, field[userAt].level);
  realNames.set(0, start.club);

  for (let div = 0; div < DIVS; div++) {
    const real = field.slice(div * DIV_SIZE, (div + 1) * DIV_SIZE);
    real.forEach((c, place) => {
      if (key(c.name) === key(start.club)) return;
      const id = clubs.length;
      const h = nameHash(c.name);
      const pal = PALETTE[h % PALETTE.length];
      const alt = PALETTE[(h + 6) % PALETTE.length];
      clubs.push({
        id, name: c.name, icon: h % ICONS.length, color: pal[0], color2: pal[1], awayColor: alt[0], awayColor2: alt[1],
        div, rep: rep(div, place), stadium: id % 4, formation: formations[h % formations.length], isUser: false,
      });
      levels.set(id, c.level);
      realNames.set(id, c.name);
    });
    // a short league is filled up with invented clubs a little weaker than its weakest real one
    const floor = (real.length ? Math.min(...real.map((c) => c.level)) : [64, 55, 46][div]) - 2;
    for (let i = 0; real.length + i < DIV_SIZE; i++) {
      const id = clubs.length;
      const pal = PALETTE[(id * 5 + div) % PALETTE.length];
      const alt = PALETTE[(id * 5 + div + 6) % PALETTE.length];
      clubs.push({
        id, name: CPU_NAMES[div][i % CPU_NAMES[div].length], icon: (id * 7) % ICONS.length, color: pal[0], color2: pal[1], awayColor: alt[0], awayColor2: alt[1],
        div, rep: rep(div, DIV_SIZE - 1), stadium: id % 4, formation: formations[id % formations.length], isUser: false,
      });
      levels.set(id, floor - i);
    }
  }

  const players: Player[] = [];
  // every real name is taken, so an invented squad filler never shares one
  const used = new Set(catalogue.map((sp) => sp.name));
  for (const c of clubs) {
    const realName = realNames.get(c.id);
    const squad = realName ? squads.get(key(realName))! : [];
    const keep = c.isUser ? firstTeam(squad) : null;
    for (const sp of squad) players.push(toLocalPlayer(sp, players.length, !keep || keep.has(sp.id) ? c.id : -1));
    topUp(r, players, c.id, levels.get(c.id)!, used);
  }
  // free agents, as in every world
  const freePos: Pos[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST', 'CB', 'CM'];
  for (let i = 0; i < 45; i++) {
    players.push(makePlayer(r, players.length, freePos[i % freePos.length], ri(r, 36, 60), i % 3 === 0 ? 16 : 18, i % 3 === 0 ? 19 : 34, -1, used));
  }
  return { clubs, players };
}

/** Invented players for the places a squad is missing, so every club can field a full team. */
function topUp(r: Rng, players: Player[], clubId: number, level: number, used: Set<string>) {
  const counts = new Map<Pos, number>();
  let size = 0;
  for (const p of players) {
    if (p.clubId !== clubId) continue;
    counts.set(p.pos, (counts.get(p.pos) ?? 0) + 1);
    size++;
  }
  while (size < CPU_MIN) {
    const need = SQUAD_SHAPE.find((pos) => (counts.get(pos) ?? 0) < SQUAD_SHAPE.filter((x) => x === pos).length) ?? 'CM';
    const target = clamp(Math.round(level + (size < 11 ? 2 : -5) + ri(r, -4, 4)), 30, 88);
    players.push(makePlayer(r, players.length, need, target, 17, 31, clubId, used));
    counts.set(need, (counts.get(need) ?? 0) + 1);
    size++;
  }
}
