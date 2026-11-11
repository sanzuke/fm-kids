export type Pos = 'GK' | 'CB' | 'LB' | 'RB' | 'CM' | 'CAM' | 'CDM' | 'LW' | 'RW' | 'ST';
export const POSITIONS: Pos[] = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];
export type Attr = 'speed' | 'shooting' | 'passing' | 'dribbling' | 'defending' | 'stamina';
export const ATTRS: Attr[] = ['speed', 'shooting', 'passing', 'dribbling', 'defending', 'stamina'];
export const ATTR_LABEL: Record<Attr, string> = {
  speed: 'Speed',
  shooting: 'Shooting',
  passing: 'Passing',
  dribbling: 'Dribbling',
  defending: 'Defending',
  stamina: 'Stamina',
};
export const ATTR_ICON: Record<Attr, string> = {
  speed: '⚡',
  shooting: '🎯',
  passing: '🤝',
  dribbling: '🌀',
  defending: '🛡️',
  stamina: '❤️',
};
export type FormationId = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '3-4-3';
export type Mentality = 0 | 1 | 2; // defend, balanced, attack
export type Style = 'short' | 'long' | 'counter';
export type Comp = 'league' | 'cup' | 'tournament' | 'friendly' | 'continental';

export interface Player {
  id: number;
  name: string;
  /** catalogue id on the server: the same master identity is reused in every save (absent for players invented locally) */
  catalogId?: number;
  age: number;
  pos: Pos;
  ovr: number;
  pot: number;
  speed: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  stamina: number;
  value: number;
  salary: number;
  clubId: number; // -1 = free agent, -2 = in the user's youth academy
  skin: number;
  hair: number;
  hairStyle: number;
  goals: number;
  assists: number;
  apps: number;
  ratingSum: number;
  training: Attr | null;
  trainProgress: number;
  /** positions learned in training, played as well as the natural one (absent on older saves) */
  extraPos?: Pos[];
  /** position being learned now, with progress 0..100 */
  posTraining?: Pos | null;
  posProgress?: number;
  /** matchdays still out injured, matches still suspended, yellow cards collected this season (absent on older saves) */
  injury?: number;
  ban?: number;
  yellows?: number;
  /** whole seasons left on the current contract; renewed or left when it hits 0 (absent on older saves) */
  contract?: number;
  /** shirt number, and the club it was given at: a number is only valid at that club (absent on older saves) */
  num?: number;
  numClub?: number;
  ovrHistory: number[];
  nat?: string;
  /** nationality name when the game has no flag for it (online players only) */
  natName?: string;
  loan?: { from: number; untilStep: number; share: number; season: number };
  askPrice?: number;
  seasonGoals: number;
  seasonAssists: number;
  seasonApps: number;
  seasonRating: number;
}

export interface Club {
  id: number;
  name: string;
  icon: number;
  color: string;
  color2: string;
  awayColor: string;
  awayColor2: string;
  div: number;
  rep: number;
  stadium: number;
  formation: FormationId;
  isUser: boolean;
  /** 0 solid, 1 vertical stripes, 2 hoops, 3 halves (user club only; bought in the kit shop) */
  kitPattern?: number;
  /** guest club from abroad: never plays in the league tables */
  foreign?: boolean;
  /** real-world club (Liverpool, Chelsea…) added because one of its players entered the world; trades but never competes */
  imported?: boolean;
}

/** One chairman challenge for the current week. */
export interface Challenge {
  kind: 'win' | 'win2' | 'clean' | 'three' | 'young' | 'derby';
  text: string;
  reward: number;
  done: boolean;
}

/** The inter-continental Champions Cup state; qualified by winning the top flight. */
export interface Continental {
  qualified: boolean;
  failed: boolean;
  round: number;
  oppId: number;
  foreignIds: number[];
}

export interface Scorer {
  pid: number;
  name: string;
  min: number;
  side: 0 | 1;
}

export interface Fixture {
  id: number;
  comp: Comp;
  step: number;
  round: number;
  home: number;
  away: number;
  played: boolean;
  hg: number;
  ag: number;
  pens?: [number, number];
  div: number;
  label: string;
  season: number;
  scorers?: Scorer[];
}

export interface TableRow {
  club: number;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

export interface Tactics {
  formation: FormationId;
  /** Set once the manager moves a position on the pitch; replaces the formation's standard layout. */
  slots?: { pos: Pos; u: number; v: number }[];
  lineup: number[];
  mentality: Mentality;
  style: Style;
  captain: number;
}

export interface Step {
  kind: 'league' | 'cup' | 'tournament';
  round: number;
  label: string;
}

export interface NewsItem {
  id: number;
  step: number;
  season: number;
  kind: 'in' | 'out' | 'info' | 'win' | 'trophy' | 'loan';
  text: string;
}
export interface Offer {
  id: number;
  playerId: number;
  from: number;
  amount: number;
  step: number;
}
export interface Txn {
  season: number;
  step: number;
  text: string;
  amount: number;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  volume: number;
  defaultMode: 'watch' | 'highlights' | 'quick';
}

export interface GameState {
  v: number;
  seed: number;
  season: number;
  step: number;
  manager: string;
  userClub: number;
  clubs: Club[];
  players: Player[];
  tactics: Tactics;
  fixtures: Fixture[];
  nextFixtureId: number;
  steps: Step[];
  tables: TableRow[][];
  cup: { teams: number[]; round: number; winner: number | null };
  tourn: { teams: number[]; round: number; winner: number | null };
  balance: number;
  facilities: { training: number; stadium: number; youth: number };
  txns: Txn[];
  balanceHistory: number[];
  news: NewsItem[];
  newsId: number;
  offers: Offer[];
  offerId: number;
  trophies: { season: number; name: string; icon: string }[];
  achievements: Record<string, number>;
  history: { season: number; div: number; pos: number }[];
  cards: number[];
  friendlies: Fixture[];
  settings: Settings;
  /** the eternal neighbour club; derby matches against them feel bigger */
  rival?: number;
  /** this week's chairman challenge (absent on older saves) */
  challenge?: Challenge | null;
  /** Champions Cup progress (absent on older saves) */
  continental?: Continental | null;
  /** kit patterns owned in the kit shop */
  kitOwned?: number[];
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  seasonSummary: SeasonSummary | null;
  /** set once the youth academy has its first group of players (absent on older saves) */
  academyOpen?: boolean;
  /** catalogue ids of the players signed from the server, so none is signed twice (absent on older saves) */
  serverSignings?: number[];
  /** catalogue ids already brought into this world (absent on older saves) */
  serverImported?: number[];
  /** the season whose real-player catalogue this world carries (absent until the first sync) */
  catalogue?: { season: number; syncedAt: number; players: number };
}

export interface SeasonSummary {
  season: number;
  div: number;
  pos: number;
  result: 'promoted' | 'relegated' | 'stay' | 'champion';
  prize: number;
  lines: string[];
}
