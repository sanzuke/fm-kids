// Turning the server's catalogue into this save's real players.
//
// The catalogue is the shared, read-only database of real footballers; a save keeps its own
// copy of them at their real clubs. Copying them in spends no coins: they simply appear in the
// transfer market like every other player. A new season copies the catalogue in again, which
// refreshes ages, ratings, clubs and values of the players already here.
import type { GameState, Player } from './types';
import { ATTRS } from './types';
import type { ServerPlayer } from '../api/server';
import { toLocalPlayer } from './serverPlayers';
import { ACADEMY, ensureNumbers, ensureRealClub } from './world';

export interface CatalogueResult {
  /** real players added to this world for the first time */
  added: number;
  /** real players whose age, rating, club or value was brought up to date */
  updated: number;
  /** how many players the catalogue offered */
  total: number;
  season: number;
}

/** The player as the catalogue describes him, keeping everything this save has learned. */
function refresh(p: Player, sp: ServerPlayer, clubId: number) {
  const fresh = toLocalPlayer(sp, p.id, clubId);
  p.catalogId = sp.id;
  p.name = fresh.name;
  p.age = fresh.age;
  p.pos = fresh.pos;
  p.extraPos = fresh.extraPos;
  p.nat = fresh.nat;
  p.natName = fresh.natName;
  p.ovr = fresh.ovr;
  p.pot = fresh.pot;
  for (const a of ATTRS) p[a] = fresh[a];
  p.value = fresh.value;
  p.salary = fresh.salary;
  p.ovrHistory = [...p.ovrHistory.slice(-11), fresh.ovr];
  // a loan still runs at the club that borrowed him; otherwise he is where the catalogue says
  if (!p.loan) p.clubId = clubId;
}

/**
 * Copy real players from the catalogue into this save, or refresh the ones already here.
 *
 * Identity is the catalogue id. A save made before ids were stored falls back to the name once
 * (the generated squads already borrow real names), and from then on that player carries the
 * id. The manager's own players are never moved or recalculated: their progression belongs to
 * the save, not to the catalogue.
 */
export function applyCatalogue(g: GameState, list: ServerPlayer[], season: number, now = Date.now()): CatalogueResult {
  const byId = new Map<number, Player>();
  const byName = new Map<string, Player>();
  for (const p of g.players) {
    if (p.clubId === ACADEMY) continue;
    if (typeof p.catalogId === 'number') byId.set(p.catalogId, p);
    else if (!byName.has(p.name)) byName.set(p.name, p);
  }

  const clubIds = new Map<string, number>();
  let added = 0;
  let updated = 0;

  for (const sp of list) {
    if (!sp?.name) continue;
    const key = sp.club?.name?.trim().toLowerCase() ?? '';
    let clubId = -1;
    if (key) {
      clubId = clubIds.get(key) ?? ensureRealClub(g, sp.club!.name);
      clubIds.set(key, clubId);
    }

    let p = byId.get(sp.id) ?? byName.get(sp.name);
    if (!p) {
      p = toLocalPlayer(sp, g.players.length, clubId);
      g.players.push(p);
      (g.serverImported ??= []).push(sp.id);
      added++;
      continue;
    }
    if (p.catalogId === undefined) {
      p.catalogId = sp.id;
      (g.serverImported ??= []).push(sp.id);
    }
    // the manager's own player keeps the training and growth earned in this save
    if (p.clubId === g.userClub) continue;
    refresh(p, sp, clubId);
    updated++;
  }

  g.catalogue = { season, syncedAt: now, players: list.length };
  if (added) ensureNumbers(g);
  return { added, updated, total: list.length, season };
}
