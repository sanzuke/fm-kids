import type { Player } from './types';
import { realNation } from './realPlayers';

// Player nationalities. A nationality is worked out from the player's name, so it never
// changes, needs no save data, and players in older saves get one too.
export interface Nation {
  code: string;
  name: string;
  /** stripes: horizontal or vertical bands, first band at the top/left */
  dir: 'h' | 'v';
  bands: string[];
  /** extra shape on top of the bands */
  mark?: FlagMark;
  markColor?: string;
  /** a second, smaller shape drawn over the first */
  mark2?: FlagMark;
  mark2Color?: string;
  /** how common the nation is among generated players */
  weight: number;
}

export type FlagMark =
  | 'disc' | 'dot' | 'sun' | 'halfdisc' | 'cross' | 'plus' | 'nordic' | 'nordicThin'
  | 'saltire' | 'diamond' | 'star' | 'canton' | 'triangle' | 'crescent';

export const NATIONS: Nation[] = [
  { code: 'IDN', name: 'Indonesia', dir: 'h', bands: ['#e70011', '#ffffff'], weight: 3 },
  { code: 'BRA', name: 'Brazil', dir: 'h', bands: ['#009b3a'], mark: 'diamond', markColor: '#fedf00', mark2: 'dot', mark2Color: '#002776', weight: 3 },
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
  // countries the real-player catalogue brings in; weight 0 keeps them out of generated names
  { code: 'POR', name: 'Portugal', dir: 'v', bands: ['#046a38','#046a38','#da291c','#da291c','#da291c'], mark: 'sun', markColor: '#ffe900', weight: 0 },
  { code: 'IRL', name: 'Republic of Ireland', dir: 'v', bands: ['#169b62','#ffffff','#ff883e'], weight: 0 },
  { code: 'SCO', name: 'Scotland', dir: 'h', bands: ['#005eb8'], mark: 'saltire', markColor: '#ffffff', weight: 0 },
  { code: 'DEN', name: 'Denmark', dir: 'h', bands: ['#c8102e'], mark: 'nordic', markColor: '#ffffff', weight: 0 },
  { code: 'WAL', name: 'Wales', dir: 'h', bands: ['#ffffff','#00b140'], mark: 'star', markColor: '#c8102e', weight: 0 },
  { code: 'NIR', name: 'Northern Ireland', dir: 'h', bands: ['#ffffff'], mark: 'cross', markColor: '#ce1124', mark2: 'star', mark2Color: '#ffffff', weight: 0 },
  { code: 'USA', name: 'USA', dir: 'h', bands: ['#b22234','#ffffff','#b22234','#ffffff','#b22234','#ffffff','#b22234'], mark: 'canton', markColor: '#3c3b6e', weight: 0 },
  { code: 'CAN', name: 'Canada', dir: 'v', bands: ['#d80621','#ffffff','#ffffff','#d80621'], mark: 'star', markColor: '#d80621', weight: 0 },
  { code: 'MEX', name: 'Mexico', dir: 'v', bands: ['#006847','#ffffff','#ce1126'], mark: 'sun', markColor: '#8c6239', weight: 0 },
  { code: 'JAM', name: 'Jamaica', dir: 'h', bands: ['#009b3a'], mark: 'saltire', markColor: '#fed100', weight: 0 },
  { code: 'GRN', name: 'Grenada', dir: 'h', bands: ['#ce1126'], mark: 'diamond', markColor: '#fcd116', mark2: 'dot', mark2Color: '#007a5e', weight: 0 },
  { code: 'CRC', name: 'Costa Rica', dir: 'h', bands: ['#002b7f','#ffffff','#ce1126','#ce1126','#ffffff','#002b7f'], weight: 0 },
  { code: 'URU', name: 'Uruguay', dir: 'h', bands: ['#ffffff','#0038a8','#ffffff','#0038a8','#ffffff'], mark: 'sun', markColor: '#fcd116', weight: 0 },
  { code: 'PAR', name: 'Paraguay', dir: 'h', bands: ['#d52b1e','#ffffff','#0038a8'], mark: 'sun', markColor: '#fcd116', weight: 0 },
  { code: 'ECU', name: 'Ecuador', dir: 'h', bands: ['#ffdd00','#ffdd00','#034ea2','#ed1c24'], mark: 'sun', markColor: '#8c6239', weight: 0 },
  { code: 'CHI', name: 'Chile', dir: 'h', bands: ['#ffffff','#d52b1e'], mark: 'canton', markColor: '#0039a6', weight: 0 },
  { code: 'NOR', name: 'Norway', dir: 'h', bands: ['#ba0c2f'], mark: 'nordic', markColor: '#ffffff', mark2: 'nordicThin', mark2Color: '#00205b', weight: 0 },
  { code: 'FIN', name: 'Finland', dir: 'h', bands: ['#ffffff'], mark: 'nordic', markColor: '#003580', weight: 0 },
  { code: 'POL', name: 'Poland', dir: 'h', bands: ['#ffffff','#dc143c'], weight: 0 },
  { code: 'UKR', name: 'Ukraine', dir: 'h', bands: ['#0057b7','#ffd700'], weight: 0 },
  { code: 'TUR', name: 'Türkiye', dir: 'h', bands: ['#e30a17'], mark: 'crescent', markColor: '#ffffff', weight: 0 },
  { code: 'SUI', name: 'Switzerland', dir: 'h', bands: ['#da291c'], mark: 'plus', markColor: '#ffffff', weight: 0 },
  { code: 'AUT', name: 'Austria', dir: 'h', bands: ['#ed2939','#ffffff','#ed2939'], weight: 0 },
  { code: 'CRO', name: 'Croatia', dir: 'h', bands: ['#ff0000','#ffffff','#171796'], mark: 'sun', markColor: '#ff0000', weight: 0 },
  { code: 'SRB', name: 'Serbia', dir: 'h', bands: ['#c6363c','#0c4076','#ffffff'], weight: 0 },
  { code: 'HUN', name: 'Hungary', dir: 'h', bands: ['#ce2939','#ffffff','#477050'], weight: 0 },
  { code: 'GRE', name: 'Greece', dir: 'h', bands: ['#0d5eaf','#ffffff','#0d5eaf','#ffffff','#0d5eaf'], mark: 'canton', markColor: '#0d5eaf', mark2: 'plus', mark2Color: '#ffffff', weight: 0 },
  { code: 'SVK', name: 'Slovakia', dir: 'h', bands: ['#ffffff','#0b4ea2','#ee1c25'], mark: 'sun', markColor: '#ee1c25', weight: 0 },
  { code: 'SVN', name: 'Slovenia', dir: 'h', bands: ['#ffffff','#0057b8','#ed1c24'], mark: 'canton', markColor: '#0057b8', weight: 0 },
  { code: 'ROU', name: 'Romania', dir: 'v', bands: ['#002b7f','#fcd116','#ce1126'], weight: 0 },
  { code: 'CZE', name: 'Czechia', dir: 'h', bands: ['#ffffff','#d7141a'], mark: 'triangle', markColor: '#11457e', weight: 0 },
  { code: 'ALB', name: 'Albania', dir: 'h', bands: ['#e41e20'], mark: 'star', markColor: '#000000', weight: 0 },
  { code: 'KOS', name: 'Kosovo', dir: 'h', bands: ['#244aa5'], mark: 'star', markColor: '#d0a650', weight: 0 },
  { code: 'BIH', name: 'Bosnia and Herzegovina', dir: 'h', bands: ['#002395'], mark: 'triangle', markColor: '#fecb00', weight: 0 },
  { code: 'ISR', name: 'Israel', dir: 'h', bands: ['#ffffff','#0038b8','#ffffff','#ffffff','#ffffff','#0038b8','#ffffff'], mark: 'star', markColor: '#0038b8', weight: 0 },
  { code: 'IRN', name: 'Iran', dir: 'h', bands: ['#239f40','#ffffff','#da0000'], mark: 'sun', markColor: '#da0000', weight: 0 },
  { code: 'KOR', name: 'Korea Republic', dir: 'h', bands: ['#ffffff'], mark: 'disc', markColor: '#cd2e3a', mark2: 'halfdisc', mark2Color: '#0047a0', weight: 0 },
  { code: 'AUS', name: 'Australia', dir: 'h', bands: ['#012169'], mark: 'star', markColor: '#ffffff', weight: 0 },
  { code: 'NZL', name: 'New Zealand', dir: 'h', bands: ['#012169'], mark: 'star', markColor: '#c8102e', weight: 0 },
  { code: 'GHA', name: 'Ghana', dir: 'h', bands: ['#ce1126','#fcd116','#006b3f'], mark: 'star', markColor: '#000000', weight: 0 },
  { code: 'SEN', name: 'Senegal', dir: 'v', bands: ['#00853f','#fdef42','#e31b23'], mark: 'star', markColor: '#00853f', weight: 0 },
  { code: 'EGY', name: 'Egypt', dir: 'h', bands: ['#ce1126','#ffffff','#000000'], mark: 'sun', markColor: '#c09300', weight: 0 },
  { code: 'MAR', name: 'Morocco', dir: 'h', bands: ['#c1272d'], mark: 'star', markColor: '#006233', weight: 0 },
  { code: 'MLI', name: 'Mali', dir: 'v', bands: ['#14b53a','#fcd116','#ce1126'], weight: 0 },
  { code: 'CMR', name: 'Cameroon', dir: 'v', bands: ['#007a5e','#ce1126','#fcd116'], mark: 'star', markColor: '#fcd116', weight: 0 },
  { code: 'CIV', name: 'Côte d\'Ivoire', dir: 'v', bands: ['#ff8200','#ffffff','#009a44'], weight: 0 },
  { code: 'TUN', name: 'Tunisia', dir: 'h', bands: ['#e70013'], mark: 'disc', markColor: '#ffffff', mark2: 'star', mark2Color: '#e70013', weight: 0 },
  { code: 'ALG', name: 'Algeria', dir: 'v', bands: ['#006233','#ffffff'], mark: 'star', markColor: '#d21034', weight: 0 },
  { code: 'PHI', name: 'Philippines', dir: 'h', bands: ['#0038a8','#ce1126'], mark: 'triangle', markColor: '#ffffff', weight: 0 },
  { code: 'THA', name: 'Thailand', dir: 'h', bands: ['#a51931','#f4f5f8','#2d2a4a','#2d2a4a','#f4f5f8','#a51931'], weight: 0 },
  { code: 'BDI', name: 'Burundi', dir: 'h', bands: ['#ce1126','#1eb53a','#ce1126'], mark: 'saltire', markColor: '#ffffff', mark2: 'dot', mark2Color: '#ffffff', weight: 0 },
  { code: 'SSD', name: 'South Sudan', dir: 'h', bands: ['#000000','#da121a','#078930'], mark: 'triangle', markColor: '#0f47af', weight: 0 },
  { code: 'MNE', name: 'Montenegro', dir: 'h', bands: ['#c40308'], mark: 'sun', markColor: '#d4af37', weight: 0 },
  { code: 'TLS', name: 'Timor-Leste', dir: 'h', bands: ['#dc241f'], mark: 'triangle', markColor: '#000000', weight: 0 },
  { code: 'CPV', name: 'Cape Verde', dir: 'h', bands: ['#003893','#003893','#ffffff','#cf2027','#ffffff','#003893'], weight: 0 },
  { code: 'MKD', name: 'North Macedonia', dir: 'h', bands: ['#d20000'], mark: 'saltire', markColor: '#ffe600', mark2: 'dot', mark2Color: '#ffe600', weight: 0 },
  { code: 'LBN', name: 'Lebanon', dir: 'h', bands: ['#ed1c24','#ffffff','#ffffff','#ed1c24'], mark: 'sun', markColor: '#00a651', weight: 0 },
  { code: 'UZB', name: 'Uzbekistan', dir: 'h', bands: ['#0099b5','#ffffff','#1eb53a'], weight: 0 },
  { code: 'GNB', name: 'Guinea-Bissau', dir: 'h', bands: ['#fcd116','#009e49'], mark: 'canton', markColor: '#ce1126', weight: 0 },
  { code: 'KGZ', name: 'Kyrgyz Republic', dir: 'h', bands: ['#e8112d'], mark: 'dot', markColor: '#ffef00', weight: 0 },
  { code: 'ANG', name: 'Angola', dir: 'h', bands: ['#cc092f','#000000'], mark: 'sun', markColor: '#ffcb00', weight: 0 },
  { code: 'PAN', name: 'Panama', dir: 'h', bands: ['#ffffff','#da121a'], mark: 'canton', markColor: '#ffffff', weight: 0 },
  { code: 'VEN', name: 'Venezuela', dir: 'h', bands: ['#ffcc00','#00247d','#cf142b'], weight: 0 },
  { code: 'HAI', name: 'Haiti', dir: 'h', bands: ['#00209f','#d21034'], weight: 0 },
  { code: 'CHA', name: 'Chad', dir: 'v', bands: ['#002664','#fecb00','#c60c30'], weight: 0 },
  { code: 'IND', name: 'India', dir: 'h', bands: ['#ff9933','#ffffff','#138808'], mark: 'sun', markColor: '#000080', weight: 0 },
  { code: 'MYA', name: 'Myanmar', dir: 'h', bands: ['#fecb00','#34b233','#ea2839'], mark: 'star', markColor: '#ffffff', weight: 0 },
  { code: 'AFG', name: 'Afghanistan', dir: 'v', bands: ['#000000','#d32011','#007a36'], weight: 0 },
  { code: 'VIN', name: 'St. Vincent and the Grenadines', dir: 'v', bands: ['#0072c6','#fcd116','#fcd116','#009e60'], weight: 0 },
  { code: 'NCA', name: 'Nicaragua', dir: 'h', bands: ['#0067c6','#ffffff','#0067c6'], weight: 0 },
  { code: 'NEP', name: 'Nepal', dir: 'h', bands: ['#dc143c'], mark: 'triangle', markColor: '#003893', weight: 0 },
  { code: 'ARM', name: 'Armenia', dir: 'h', bands: ['#d90012','#0033a0','#f2a800'], weight: 0 },
  { code: 'CUW', name: 'Curaçao', dir: 'h', bands: ['#002b7f','#002b7f','#002b7f','#f9e814','#002b7f'], weight: 0 },
  { code: 'PLE', name: 'Palestine', dir: 'h', bands: ['#000000','#ffffff','#007a3d'], mark: 'triangle', markColor: '#ce1126', weight: 0 },
  { code: 'BFA', name: 'Burkina Faso', dir: 'h', bands: ['#ef2b2d','#009e49'], mark: 'star', markColor: '#fcd116', weight: 0 },
  { code: 'GAB', name: 'Gabon', dir: 'h', bands: ['#009e60','#fcd116','#3a75c4'], weight: 0 },
  { code: 'COD', name: 'Congo DR', dir: 'h', bands: ['#007fff'], mark: 'star', markColor: '#f7d618', weight: 0 },
  { code: 'ZAM', name: 'Zambia', dir: 'v', bands: ['#198a00','#198a00','#198a00','#de2010','#000000','#ef7d00'], weight: 0 },
  { code: 'ZIM', name: 'Zimbabwe', dir: 'h', bands: ['#006400','#ffd200','#d40000','#000000','#d40000','#ffd200','#006400'], mark: 'triangle', markColor: '#ffffff', weight: 0 },
];

const BY_CODE = new Map(NATIONS.map((n) => [n.code, n]));
const BY_NAME = new Map(NATIONS.map((n) => [n.name.toLowerCase(), n]));
const TOTAL = NATIONS.reduce((s, n) => s + n.weight, 0);
// first names from the name list that are Indonesian
const INDONESIAN_NAMES = new Set(['Bima', 'Adi', 'Bagas', 'Citra', 'Dimas', 'Eko', 'Yoga', 'Joni', 'Wiko', 'Uki']);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function nationOf(p: Pick<Player, 'name'> & { nat?: string; natName?: string }): Nation {
  // a player signed from the server keeps the nationality the catalogue gave them
  const known = (p.nat ? BY_CODE.get(p.nat) : undefined) ?? (p.natName ? BY_NAME.get(p.natName.toLowerCase()) : undefined);
  if (known) return known;
  const real = BY_CODE.get(realNation(p.name) ?? '');
  if (real) return real;
  if (INDONESIAN_NAMES.has(p.name.split(' ')[0])) return NATIONS[0];
  let roll = hash(p.name) % TOTAL;
  for (const n of NATIONS) {
    if (roll < n.weight) return n;
    roll -= n.weight;
  }
  return NATIONS[0];
}
export const nationByCode = (code: string) => BY_CODE.get(code);
