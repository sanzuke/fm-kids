import type { Attr, Club, FormationId, Pos, Player } from './types';
import { ATTRS } from './types';
import { pickReal } from './realPlayers';

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = () => number;
export const ri = (r: Rng, a: number, b: number) => Math.floor(r() * (b - a + 1)) + a;
export const pick = <T,>(r: Rng, arr: T[]): T => arr[Math.floor(r() * arr.length)];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const FIRST = ['Rafa', 'Leo', 'Bima', 'Toby', 'Max', 'Kiko', 'Nico', 'Dani', 'Oli', 'Zack', 'Finn', 'Gabe', 'Hugo', 'Ivan', 'Joni', 'Kai', 'Lio', 'Milo', 'Ned', 'Otto', 'Pip', 'Quin', 'Remy', 'Sami', 'Tino', 'Uki', 'Vito', 'Wiko', 'Yuri', 'Zeno', 'Arlo', 'Bram', 'Cody', 'Dexi', 'Eli', 'Fabi', 'Gino', 'Hans', 'Ilo', 'Jayo', 'Kobi', 'Luca', 'Mati', 'Niko', 'Omar', 'Pablo', 'Rio', 'Stevo', 'Tomo', 'Ugo', 'Vin', 'Wali', 'Xavi', 'Yoga', 'Ziggy', 'Adi', 'Bagas', 'Citra', 'Dimas', 'Eko'];
const LAST = ['Bintang', 'Rocket', 'Swift', 'Lightfoot', 'Goalie', 'Striker', 'Sparks', 'Bouncy', 'Zoom', 'Cheeky', 'Brave', 'Mighty', 'Speedy', 'Lucky', 'Jolly', 'Sunny', 'Windy', 'Fuzzy', 'Zesty', 'Dazzle', 'Thunder', 'Comet', 'Dribble', 'Hopper', 'Kicker', 'Blaze', 'Wonder', 'Turbo', 'Gallop', 'Sprint', 'Pepper', 'Maple', 'Cloud', 'Pebble', 'Wiggle', 'Shadow', 'Nimble', 'Rumble', 'Giggle', 'Spark', 'Banjo', 'Cosmo', 'Doodle', 'Fizz', 'Gizmo', 'Jinx', 'Kazoo', 'Mambo', 'Noodle', 'Pogo'];

const W: Record<Pos, number[]> = {
  GK: [0.1, 0.0, 0.1, 0.1, 0.6, 0.1],
  CB: [0.12, 0.03, 0.1, 0.05, 0.55, 0.15],
  LB: [0.2, 0.05, 0.15, 0.1, 0.35, 0.15],
  RB: [0.2, 0.05, 0.15, 0.1, 0.35, 0.15],
  CDM: [0.1, 0.05, 0.2, 0.1, 0.4, 0.15],
  CM: [0.1, 0.1, 0.3, 0.2, 0.15, 0.15],
  CAM: [0.1, 0.2, 0.25, 0.3, 0.05, 0.1],
  LW: [0.25, 0.2, 0.15, 0.3, 0.02, 0.08],
  RW: [0.25, 0.2, 0.15, 0.3, 0.02, 0.08],
  ST: [0.2, 0.45, 0.05, 0.2, 0.0, 0.1],
};

export function calcOvr(p: Pick<Player, Attr | 'pos'>): number {
  const w = W[p.pos];
  let s = 0;
  ATTRS.forEach((a, i) => (s += p[a] * w[i]));
  return Math.round(s);
}

export function calcValue(ovr: number, pot: number, age: number): number {
  const base = 50 * Math.exp((ovr - 40) * 0.085);
  const potBonus = 1 + Math.max(0, pot - ovr) * 0.012 * (age < 24 ? 1 : 0.3);
  const ageF = age < 22 ? 1.1 : age <= 28 ? 1 : age <= 31 ? 0.8 : 0.55;
  return Math.max(10, Math.round((base * potBonus * ageF) / 10) * 10);
}
export const calcSalary = (value: number) => Math.max(1, Math.round(value / 50));

export function rarity(ovr: number): 'bronze' | 'silver' | 'gold' | 'diamond' {
  return ovr >= 75 ? 'diamond' : ovr >= 62 ? 'gold' : ovr >= 50 ? 'silver' : 'bronze';
}

export function makePlayer(r: Rng, id: number, pos: Pos, target: number, minAge: number, maxAge: number, clubId: number, used: Set<string>): Player {
  // a real footballer of this level when one is free, otherwise an invented kid
  const real = pickReal(r, pos, target, minAge, maxAge, used);
  let name = real?.name ?? '';
  for (let k = 0; k < 20 && !real; k++) {
    name = `${pick(r, FIRST)} ${pick(r, LAST)}`;
    if (!used.has(name)) break;
  }
  used.add(name);
  const age = real?.age ?? ri(r, minAge, maxAge);
  if (real) target = real.ovr;
  const w = W[pos];
  const emph = w.map((x) => (x - 1 / 6) * 70);
  const noise = ATTRS.map(() => (r() - 0.5) * 12);
  let wsum = 0;
  w.forEach((x, i) => (wsum += x * (emph[i] + noise[i])));
  const base = target - wsum;
  const vals = {} as Record<Attr, number>;
  ATTRS.forEach((a, i) => (vals[a] = clamp(Math.round(base + emph[i] + noise[i]), 12, 97)));
  const ovr = calcOvr({ ...vals, pos });
  const growth = age <= 18 ? ri(r, 8, 22) : age <= 21 ? ri(r, 5, 16) : age <= 25 ? ri(r, 1, 8) : age <= 29 ? ri(r, 0, 3) : 0;
  const pot = clamp(ovr + growth, ovr, 96);
  const value = calcValue(ovr, pot, age);
  return {
    id, name, age, pos, ovr, pot, ...vals, value, salary: calcSalary(value), clubId,
    contract: ri(r, 1, 3), // seasons on the first contract
    skin: ri(r, 0, 5), hair: ri(r, 0, 6), hairStyle: ri(r, 0, 3),
    goals: 0, assists: 0, apps: 0, ratingSum: 0, training: null, trainProgress: 0, ovrHistory: [ovr],
    seasonGoals: 0, seasonAssists: 0, seasonApps: 0, seasonRating: 0,
  };
}

export const SQUAD_SHAPE: Pos[] = ['GK', 'GK', 'CB', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST', 'CM'];

export const ICONS = ['🦁', '🐯', '🦅', '🐺', '🚀', '⚡', '🌟', '🔥', '🐲', '🦈', '👑', '🐻'];
export const PALETTE: [string, string][] = [
  ['#e63946', '#ffffff'], ['#1d6fe0', '#ffd23f'], ['#2ecc71', '#ffffff'], ['#ffd23f', '#1d2b53'],
  ['#8e44ad', '#ffffff'], ['#ff8c1a', '#1d2b53'], ['#00b3b3', '#ffffff'], ['#222b45', '#ff6b6b'],
  ['#ff5fa2', '#ffffff'], ['#7ed957', '#1d2b53'], ['#ffffff', '#e63946'], ['#5b4bdb', '#ffd23f'],
];
export const COLORS = ['#e63946', '#1d6fe0', '#2ecc71', '#ffd23f', '#8e44ad', '#ff8c1a', '#00b3b3', '#222b45', '#ff5fa2', '#7ed957', '#ffffff', '#5b4bdb'];

export const STADIUMS = [
  { name: 'Green Meadow', cap: 2000, icon: '🌳' },
  { name: 'Sunny Arena', cap: 3000, icon: '☀️' },
  { name: 'Rocket Dome', cap: 4500, icon: '🚀' },
  { name: 'Candy Park', cap: 3500, icon: '🍭' },
];

const DIV_NAMES = ['Gold League', 'Silver League', 'Bronze League'];
export const divName = (d: number) => DIV_NAMES[d] ?? 'League';

const CPU_NAMES: string[][] = [
  ['Golden Lions', 'Thunder Hawks', 'Royal Dragons', 'Sky Rockets', 'Crimson Wolves', 'Ocean Sharks', 'Star Tigers', 'Emerald Eagles'],
  ['Sunny Foxes', 'Blue Bears', 'Lucky Stars', 'Fire Pandas', 'Jungle Monkeys', 'Silver Owls', 'Purple Panthers', 'Mighty Mammoths'],
  ['Happy Hippos', 'Tiny Turtles', 'Bouncy Bunnies', 'Speedy Snails', 'Cheeky Chicks', 'Wobbly Whales', 'Zippy Zebras'],
];

export interface WorldInit {
  clubs: Club[];
  players: Player[];
}

export function createWorld(seed: number, user: { name: string; icon: number; color: string; color2: string; awayColor: string; awayColor2: string; stadium: number }): WorldInit {
  const r = mulberry(seed);
  const used = new Set<string>();
  const clubs: Club[] = [];
  const players: Player[] = [];
  clubs.push({
    id: 0, name: user.name, icon: user.icon, color: user.color, color2: user.color2, awayColor: user.awayColor, awayColor2: user.awayColor2,
    div: 2, rep: 10, stadium: user.stadium, formation: '4-4-2', isUser: true,
  });
  let cid = 1;
  const formations: FormationId[] = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3'];
  for (let div = 0; div < 3; div++) {
    for (const name of CPU_NAMES[div]) {
      const pal = PALETTE[(cid * 5 + div) % PALETTE.length];
      const alt = PALETTE[(cid * 5 + div + 6) % PALETTE.length];
      clubs.push({
        id: cid, name, icon: (cid * 7) % ICONS.length, color: pal[0], color2: pal[1], awayColor: alt[0], awayColor2: alt[1],
        div, rep: [62, 40, 22][div] + ri(r, -8, 10), stadium: cid % 4, formation: pick(r, formations), isUser: false,
      });
      cid++;
    }
  }
  let pid = 0;
  for (const c of clubs) {
    const base = c.isUser ? 47 : [64, 55, 46][c.div] + ri(r, -3, 4);
    const strengthBias = c.isUser ? 0 : (c.rep - [62, 40, 22][c.div]) * 0.25;
    SQUAD_SHAPE.forEach((pos, i) => {
      const starter = i < 11;
      const t = clamp(Math.round(base + strengthBias + (starter ? 2 : -5) + ri(r, -5, 5)), 30, 88);
      const youth = c.isUser && i >= 11 && i % 2 === 1;
      players.push(makePlayer(r, pid++, pos, t, youth ? 15 : 17, youth ? 18 : 31, c.id, used));
    });
  }
  // free agents
  const freePos: Pos[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST', 'CB', 'CM'];
  for (let i = 0; i < 45; i++) {
    const pos = freePos[i % freePos.length];
    players.push(makePlayer(r, pid++, pos, ri(r, 36, 60), i % 3 === 0 ? 16 : 18, i % 3 === 0 ? 19 : 34, -1, used));
  }
  return { clubs, players };
}
