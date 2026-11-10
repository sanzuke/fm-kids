import type { Player } from './types';

// Player nationalities. A nationality is worked out from the player's name, so it never
// changes, needs no save data, and players in older saves get one too.
export interface Nation {
  code: string;
  name: string;
  /** stripes: horizontal or vertical bands, first band at the top/left */
  dir: 'h' | 'v';
  bands: string[];
  /** extra shape on top of the bands */
  mark?: 'disc' | 'cross' | 'nordic' | 'diamond' | 'sun';
  markColor?: string;
  /** how common the nation is among generated players */
  weight: number;
}

export const NATIONS: Nation[] = [
  { code: 'IDN', name: 'Indonesia', dir: 'h', bands: ['#e70011', '#ffffff'], weight: 3 },
  { code: 'BRA', name: 'Brazil', dir: 'h', bands: ['#009b3a'], mark: 'diamond', markColor: '#fedf00', weight: 3 },
  { code: 'ARG', name: 'Argentina', dir: 'h', bands: ['#74acdf', '#ffffff', '#74acdf'], mark: 'sun', markColor: '#f6b40e', weight: 3 },
  { code: 'ENG', name: 'England', dir: 'h', bands: ['#ffffff'], mark: 'cross', markColor: '#ce1124', weight: 3 },
  { code: 'ESP', name: 'Spain', dir: 'h', bands: ['#aa151b', '#f1bf00', '#f1bf00', '#aa151b'], weight: 3 },
  { code: 'FRA', name: 'France', dir: 'v', bands: ['#0055a4', '#ffffff', '#ef4135'], weight: 3 },
  { code: 'GER', name: 'Germany', dir: 'h', bands: ['#000000', '#dd0000', '#ffce00'], weight: 3 },
  { code: 'ITA', name: 'Italy', dir: 'v', bands: ['#009246', '#ffffff', '#ce2b37'], weight: 3 },
  { code: 'NED', name: 'Netherlands', dir: 'h', bands: ['#ae1c28', '#ffffff', '#21468b'], weight: 2 },
  { code: 'JPN', name: 'Japan', dir: 'h', bands: ['#ffffff'], mark: 'disc', markColor: '#bc002d', weight: 2 },
  { code: 'NGA', name: 'Nigeria', dir: 'v', bands: ['#008751', '#ffffff', '#008751'], weight: 2 },
  { code: 'BEL', name: 'Belgium', dir: 'v', bands: ['#000000', '#fdda24', '#ef3340'], weight: 2 },
  { code: 'COL', name: 'Colombia', dir: 'h', bands: ['#fcd116', '#fcd116', '#003893', '#ce1126'], weight: 2 },
  { code: 'SWE', name: 'Sweden', dir: 'h', bands: ['#006aa7'], mark: 'nordic', markColor: '#fecc00', weight: 1 },
];

const BY_CODE = new Map(NATIONS.map((n) => [n.code, n]));
const TOTAL = NATIONS.reduce((s, n) => s + n.weight, 0);
// first names from the name list that are Indonesian
const INDONESIAN_NAMES = new Set(['Bima', 'Adi', 'Bagas', 'Citra', 'Dimas', 'Eko', 'Yoga', 'Joni', 'Wiko', 'Uki']);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function nationOf(p: Pick<Player, 'name'>): Nation {
  if (INDONESIAN_NAMES.has(p.name.split(' ')[0])) return NATIONS[0];
  let roll = hash(p.name) % TOTAL;
  for (const n of NATIONS) {
    if (roll < n.weight) return n;
    roll -= n.weight;
  }
  return NATIONS[0];
}
export const nationByCode = (code: string) => BY_CODE.get(code);
