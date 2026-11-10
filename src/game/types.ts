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
export type Comp = 'league' | 'cup' | 'tournament' | 'friendly';

export interface Player {
  id: number;
  name: string;
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
  clubId: number; // -1 = free agent
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
  ovrHistory: number[];
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
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  seasonSummary: SeasonSummary | null;
}

export interface SeasonSummary {
  season: number;
  div: number;
  pos: number;
  result: 'promoted' | 'relegated' | 'stay' | 'champion';
  prize: number;
  lines: string[];
}
