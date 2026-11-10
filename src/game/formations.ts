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

/** Greedy best XI for a formation. Returns player ids by slot. */
export function autoLineup(squad: Player[], formation: FormationId): number[] {
  const slots = FORMATIONS[formation];
  const used = new Set<number>();
  const result: number[] = new Array(slots.length).fill(-1);
  const order = slots.map((_, i) => i).sort((a, b) => (slots[a].pos === 'GK' ? -1 : 0) - (slots[b].pos === 'GK' ? -1 : 0));
  for (const i of order) {
    let best: Player | null = null;
    let bs = -1;
    for (const p of squad) {
      if (used.has(p.id)) continue;
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
  }
  return result;
}
