import type { FormationId, Player, Pos } from './types';

export interface Slot {
  pos: Pos;
  u: number; // 0 own goal .. 1 opponent goal
  v: number; // 0 left .. 1 right (from attacker's view)
}

const S = (pos: Pos, u: number, v: number): Slot => ({ pos, u, v });

export const FORMATIONS: Record<FormationId, Slot[]> = {
  '4-4-2': [
    S('GK', 0.05, 0.5), S('LB', 0.24, 0.12), S('CB', 0.2, 0.37), S('CB', 0.2, 0.63), S('RB', 0.24, 0.88),
    S('LW', 0.5, 0.12), S('CM', 0.46, 0.38), S('CM', 0.46, 0.62), S('RW', 0.5, 0.88),
    S('ST', 0.76, 0.38), S('ST', 0.76, 0.62),
  ],
  '4-3-3': [
    S('GK', 0.05, 0.5), S('LB', 0.24, 0.12), S('CB', 0.2, 0.37), S('CB', 0.2, 0.63), S('RB', 0.24, 0.88),
    S('CDM', 0.4, 0.5), S('CM', 0.5, 0.28), S('CM', 0.5, 0.72),
    S('LW', 0.76, 0.14), S('ST', 0.82, 0.5), S('RW', 0.76, 0.86),
  ],
  '4-2-3-1': [
    S('GK', 0.05, 0.5), S('LB', 0.24, 0.12), S('CB', 0.2, 0.37), S('CB', 0.2, 0.63), S('RB', 0.24, 0.88),
    S('CDM', 0.38, 0.36), S('CDM', 0.38, 0.64),
    S('LW', 0.62, 0.14), S('CAM', 0.63, 0.5), S('RW', 0.62, 0.86), S('ST', 0.82, 0.5),
  ],
  '3-5-2': [
    S('GK', 0.05, 0.5), S('CB', 0.2, 0.25), S('CB', 0.18, 0.5), S('CB', 0.2, 0.75),
    S('LB', 0.46, 0.08), S('CM', 0.48, 0.3), S('CDM', 0.4, 0.5), S('CM', 0.48, 0.7), S('RB', 0.46, 0.92),
    S('ST', 0.78, 0.36), S('ST', 0.78, 0.64),
  ],
  '3-4-3': [
    S('GK', 0.05, 0.5), S('CB', 0.2, 0.25), S('CB', 0.18, 0.5), S('CB', 0.2, 0.75),
    S('LB', 0.46, 0.1), S('CM', 0.46, 0.38), S('CM', 0.46, 0.62), S('RB', 0.46, 0.9),
    S('LW', 0.76, 0.16), S('ST', 0.82, 0.5), S('RW', 0.76, 0.84),
  ],
};
export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];

/**
 * Every place on the pitch a position may be moved to. Where a player stands decides the role:
 * a central player is a CDM, CM or CAM depending on how far up the pitch the place is.
 */
export const ZONES: Slot[] = [
  S('LB', 0.24, 0.12), S('CB', 0.2, 0.3), S('CB', 0.19, 0.5), S('CB', 0.2, 0.7), S('RB', 0.24, 0.88),
  S('LB', 0.38, 0.08), S('CDM', 0.37, 0.3), S('CDM', 0.37, 0.5), S('CDM', 0.37, 0.7), S('RB', 0.38, 0.92),
  S('LW', 0.51, 0.1), S('CM', 0.5, 0.3), S('CM', 0.5, 0.5), S('CM', 0.5, 0.7), S('RW', 0.51, 0.9),
  S('LW', 0.67, 0.12), S('CAM', 0.64, 0.3), S('CAM', 0.64, 0.5), S('CAM', 0.64, 0.7), S('RW', 0.67, 0.88),
  S('ST', 0.8, 0.3), S('ST', 0.82, 0.5), S('ST', 0.8, 0.7),
];

/** The layout a team plays: the manager's own one if they moved positions, else the formation's. */
export const slotsOf = (t: { formation: FormationId; slots?: Slot[] }): Slot[] => (t.slots?.length === 11 ? t.slots : FORMATIONS[t.formation]);

/** True when no position of the layout already stands on (or right next to) the zone. */
export function zoneFree(slots: Slot[], zone: Slot, ignore = -1): boolean {
  return slots.every((s, i) => i === ignore || Math.abs(s.u - zone.u) > 0.1 || Math.abs(s.v - zone.v) > 0.1);
}

/** "4-1-3-2" style name of a layout, counted line by line from the back. */
export function shapeName(slots: Slot[]): string {
  const lines = [0, 0, 0, 0, 0];
  for (const s of slots) if (s.pos !== 'GK') lines[s.u < 0.3 ? 0 : s.u < 0.44 ? 1 : s.u < 0.58 ? 2 : s.u < 0.73 ? 3 : 4]++;
  return lines.filter((n) => n > 0).join('-');
}

const PAIRS: Record<string, number> = {
  'CB-LB': 0.88, 'CB-RB': 0.88, 'LB-RB': 0.92, 'CDM-CM': 0.94, 'CAM-CM': 0.94, 'CB-CDM': 0.86,
  'CAM-CDM': 0.88, 'LW-RW': 0.93, 'LW-ST': 0.9, 'RW-ST': 0.9, 'CAM-ST': 0.9, 'CAM-LW': 0.9,
  'CAM-RW': 0.9, 'LB-LW': 0.86, 'RB-RW': 0.86, 'CM-LW': 0.86, 'CM-RW': 0.86, 'CM-LB': 0.84, 'CM-RB': 0.84,
};

export function compat(a: Pos, b: Pos): number {
  if (a === b) return 1;
  if (a === 'GK' || b === 'GK') return 0.35;
  return PAIRS[`${a}-${b}`] ?? PAIRS[`${b}-${a}`] ?? 0.74;
}

/** How well a player fits a slot, counting positions learned in training as fully known. */
export function fit(p: Pick<Player, 'pos' | 'extraPos'>, slot: Pos): number {
  let best = compat(p.pos, slot);
  for (const e of p.extraPos ?? []) best = Math.max(best, compat(e, slot));
  return best;
}

export function effOvr(p: Player, slot: Pos): number {
  return Math.round(p.ovr * fit(p, slot));
}

/**
 * Greedy best XI for a formation. Returns player ids by slot.
 *
 * Slots are filled in two passes: first every slot takes the best player who naturally plays
 * there, then whoever is left fills the rest. Without the first pass a star striker would be
 * put at left back just because he is the best player available, and the real striker would
 * sit on the bench.
 */
export function autoLineup(squad: Player[], formation: FormationId | Slot[]): number[] {
  const slots = typeof formation === 'string' ? FORMATIONS[formation] : formation;
  const used = new Set<number>();
  const result: number[] = new Array(slots.length).fill(-1);
  const order = slots.map((_, i) => i).sort((a, b) => (slots[a].pos === 'GK' ? -1 : 0) - (slots[b].pos === 'GK' ? -1 : 0));
  const pick = (i: number, naturalOnly: boolean) => {
    let best: Player | null = null;
    let bs = -1;
    for (const p of squad) {
      if (used.has(p.id)) continue;
      if (naturalOnly && p.pos !== slots[i].pos && !(p.extraPos ?? []).includes(slots[i].pos)) continue;
      const s = effOvr(p, slots[i].pos);
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    if (best) {
      used.add(best.id);
      result[i] = best.id;
    }
  };
  for (const i of order) pick(i, true);
  for (const i of order) if (result[i] === -1) pick(i, false);
  return result;
}
