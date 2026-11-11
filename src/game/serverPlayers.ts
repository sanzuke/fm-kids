// Turning a catalogue player into an ordinary player of this world.
// Once here they have the same attributes, a real club and the same transfer market as
// everyone else (negotiate the fee, agree a wage, loan, sell). Nothing about the deal is
// special-cased for catalogue players.
import type { Player } from './types';
import { POSITIONS } from './types';
import type { ServerPlayer } from '../api/server';
import { mulberry } from './data';

/** The player as the match engine, cards, squad and market screens need them. */
export function toLocalPlayer(sp: ServerPlayer, id: number, clubId = -1): Player {
  const r = mulberry(sp.id * 2654435761 + 17);
  const pos = POSITIONS.includes(sp.position) ? sp.position : 'CM';
  const extra = (sp.secondary_positions ?? []).filter((p) => p !== pos && POSITIONS.includes(p));
  const a = sp.attributes;
  return {
    id,
    catalogId: sp.id,
    name: sp.name,
    age: sp.age,
    pos,
    ovr: sp.overall,
    pot: Math.max(sp.overall, sp.potential),
    speed: a.speed,
    shooting: a.shooting,
    passing: a.passing,
    dribbling: a.dribbling,
    defending: a.defending,
    stamina: a.stamina,
    value: sp.market_value,
    salary: sp.wage,
    clubId,
    contract: 1 + (sp.id % 3),
    skin: Math.floor(r() * 6),
    hair: Math.floor(r() * 7),
    hairStyle: Math.floor(r() * 4),
    goals: 0,
    assists: 0,
    apps: 0,
    ratingSum: 0,
    training: null,
    trainProgress: 0,
    ovrHistory: [sp.overall],
    seasonGoals: 0,
    seasonAssists: 0,
    seasonApps: 0,
    seasonRating: 0,
    extraPos: extra.length ? extra : undefined,
    nat: sp.nationality?.code ?? undefined,
    natName: sp.nationality?.name ?? undefined,
  };
}
