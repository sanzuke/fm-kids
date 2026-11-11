import type { Attr, Club, Fixture, GameState, Player, Pos, Step, TableRow } from './types';
import { ATTRS, ATTR_LABEL } from './types';
import { autoLineup, fit, slotsOf, FORMATION_IDS } from './formations';
import { calcOvr, calcSalary, calcValue, calcValue as _cv, clamp, createWorld, divName, ICONS, makePlayer, mulberry, PALETTE, ri, SQUAD_SHAPE } from './data';
import type { Challenge, FormationId } from './types';
import { tv } from './tuning';
import { simulate, type MatchResult, type Setup } from './engine';

export const MAX_SQUAD = 24;
export const MIN_SQUAD = 14;
export const SAVE_KEY = 'kfm-save-v1';
/** clubId of a player who is in the user's youth academy, not yet in the first team. */
export const ACADEMY = -2;
export const ACADEMY_MAX = 8;
/** Oldest age allowed in the academy; older players must have been promoted or they leave. */
export const ACADEMY_AGE = 18;

const R = Math.random;
const rnd = (a: number, b: number) => Math.floor(R() * (b - a + 1)) + a;
const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);

export const P = (g: GameState, id: number) => g.players[id];
export const clubOf = (g: GameState, id: number): Club | undefined => g.clubs[id];
export const userClub = (g: GameState) => g.clubs[g.userClub];
export const squadOf = (g: GameState, clubId: number) => g.players.filter((p) => p.clubId === clubId);
export const userSquad = (g: GameState) => squadOf(g, g.userClub);
export const academyOf = (g: GameState) => squadOf(g, ACADEMY);
/** Yellow cards in a season that bring a one-match ban. */
export const YELLOW_LIMIT = 3;
export const unavailable = (p: Player) => (p.injury ?? 0) > 0 || (p.ban ?? 0) > 0;
/** Players who can be picked. If too few are fit to field a team, everyone is allowed so a match can still be played. */
function pickable(sq: Player[]): Player[] {
  const fitOnes = sq.filter((p) => !unavailable(p));
  return fitOnes.length >= 11 ? fitOnes : sq;
}

export function pushNews(g: GameState, kind: GameState['news'][number]['kind'], text: string) {
  g.news.unshift({ id: g.newsId++, step: g.step, season: g.season, kind, text });
  if (g.news.length > 60) g.news.length = 60;
}
export function addMoney(g: GameState, amount: number, text: string) {
  g.balance += amount;
  g.txns.unshift({ season: g.season, step: g.step, text, amount });
  if (g.txns.length > 80) g.txns.length = 80;
}

// ---------- new game ----------
export interface NewClubInput {
  manager: string;
  name: string;
  icon: number;
  color: string;
  color2: string;
  awayColor: string;
  awayColor2: string;
  stadium: number;
}

export function newGame(inp: NewClubInput): GameState {
  const seed = Math.floor(R() * 1e9);
  const { clubs, players } = createWorld(seed, inp);
  const g: GameState = {
    v: 1, seed, season: 1, step: 0, manager: inp.manager, userClub: 0, clubs, players,
    tactics: { formation: '4-4-2', lineup: [], mentality: 1, style: 'short', captain: -1 },
    fixtures: [], nextFixtureId: 1, steps: [], tables: [[], [], []],
    cup: { teams: [], round: 0, winner: null }, tourn: { teams: [], round: 0, winner: null },
    balance: 3000, facilities: { training: 1, stadium: 1, youth: 1 }, txns: [], balanceHistory: [3000],
    rival: -1, challenge: null, continental: null, kitOwned: [0],
    news: [], newsId: 1, offers: [], offerId: 1, trophies: [], achievements: {}, history: [],
    cards: [], friendlies: [],
    settings: { sound: true, music: true, volume: 0.6, defaultMode: 'watch' },
    wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, seasonSummary: null,
  };
  const sq = userSquad(g);
  g.cards = sq.map((p) => p.id);
  g.tactics.lineup = autoLineup(sq, g.tactics.formation);
  g.tactics.captain = best(sq.filter((p) => g.tactics.lineup.includes(p.id)))?.id ?? sq[0].id;
  g.rival = g.clubs.find((c) => !c.isUser && c.div === g.clubs[g.userClub].div)!.id;
  ensureNumbers(g);
  ensureExtras(g);
  openAcademy(g);
  startSeason(g);
  regenChallenge(g);
  pushNews(g, 'info', `Welcome, Manager ${inp.manager}! ${inp.name} is ready for its first season.`);
  return g;
}

const best = (ps: Player[]) => ps.slice().sort((a, b) => b.ovr - a.ovr)[0];

// ---------- season / fixtures ----------
function buildSteps(): Step[] {
  const s: Step[] = [];
  const cupNames = ['Cup Round of 16', 'Cup Quarter-final', 'Cup Semi-final', 'Cup Final'];
  let cup = 0;
  for (let r = 0; r < 14; r++) {
    s.push({ kind: 'league', round: r, label: `League Round ${r + 1}` });
    if ([2, 5, 8, 11].includes(r)) {
      s.push({ kind: 'cup', round: cup, label: cupNames[cup] });
      cup++;
    }
  }
  ['Tournament Quarter-final', 'Tournament Semi-final', 'Tournament Final'].forEach((l, i) => s.push({ kind: 'tournament', round: i, label: l }));
  return s;
}

function newFixture(g: GameState, comp: Fixture['comp'], step: number, round: number, home: number, away: number, div: number, label: string): Fixture {
  const f: Fixture = { id: g.nextFixtureId++, comp, step, round, home, away, played: false, hg: 0, ag: 0, div, label, season: g.season };
  return f;
}

function startSeason(g: GameState) {
  g.steps = buildSteps();
  g.step = 0;
  g.fixtures = [];
  g.tables = [0, 1, 2].map((d) => g.clubs.filter((c) => c.div === d).map((c) => ({ club: c.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }) as TableRow));
  const stepOfRound = g.steps.map((s, i) => (s.kind === 'league' ? i : -1)).filter((i) => i >= 0);
  for (let d = 0; d < 3; d++) {
    const ids = g.clubs.filter((c) => c.div === d).map((c) => c.id);
    const n = ids.length;
    let arr = ids.slice();
    const rounds: [number, number][][] = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs: [number, number][] = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i];
        const b = arr[n - 1 - i];
        pairs.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
      }
      rounds.push(pairs);
      arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
    }
    const all = [...rounds, ...rounds.map((rd) => rd.map(([a, b]) => [b, a] as [number, number]))];
    all.forEach((pairs, r) => {
      for (const [h, a] of pairs) g.fixtures.push(newFixture(g, 'league', stepOfRound[r], r, h, a, d, `${divName(d)} · Round ${r + 1}`));
    });
  }
  const others = g.clubs.filter((c) => c.id !== g.userClub && !c.foreign).map((c) => c.id);
  for (let i = others.length - 1; i > 0; i--) {
    const j = rnd(0, i);
    [others[i], others[j]] = [others[j], others[i]];
  }
  g.cup = { teams: [g.userClub, ...others.slice(0, 15)], round: 0, winner: null };
  g.tourn = { teams: [], round: 0, winner: null };
  prepareStep(g);
}

function prepareStep(g: GameState) {
  regenChallenge(g);
  const st = g.steps[g.step];
  if (!st || g.fixtures.some((f) => f.step === g.step)) return;
  if (st.kind === 'cup') {
    const t = g.cup.teams.slice();
    for (let i = t.length - 1; i > 0; i--) {
      const j = rnd(0, i);
      [t[i], t[j]] = [t[j], t[i]];
    }
    for (let i = 0; i + 1 < t.length; i += 2) g.fixtures.push(newFixture(g, 'cup', g.step, st.round, t[i], t[i + 1], -1, st.label));
  } else if (st.kind === 'tournament') {
    if (st.round === 0) {
      const q: number[] = [];
      for (let d = 0; d < 3; d++) q.push(...sortTable(g.tables[d]).slice(0, 2).map((r) => r.club));
      const rest = g.clubs.filter((c) => !c.foreign && !q.includes(c.id)).sort((a, b) => b.rep - a.rep).slice(0, 8 - q.length);
      q.push(...rest.map((c) => c.id));
      g.tourn.teams = q;
      pushNews(g, 'info', `The Kids Champions Tournament begins! ${g.tourn.teams.includes(g.userClub) ? 'You are in!' : 'You did not qualify this year.'}`);
    }
    const t = g.tourn.teams.slice();
    if (st.round === 0) for (let i = t.length - 1; i > 0; i--) {
      const j = rnd(0, i);
      [t[i], t[j]] = [t[j], t[i]];
    }
    g.tourn.teams = t;
    for (let i = 0; i + 1 < t.length; i += 2) g.fixtures.push(newFixture(g, 'tournament', g.step, st.round, t[i], t[i + 1], -1, st.label));
  }
}

/** The eleven a computer club is expected to start with (what the user would face). */
export function expectedLineup(g: GameState, clubId: number): number[] {
  return autoLineup(pickable(squadOf(g, clubId)), g.clubs[clubId].formation);
}

export function sortTable(rows: TableRow[]): TableRow[] {
  return rows.slice().sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.club - b.club);
}
export function tablePos(g: GameState, clubId: number) {
  const c = g.clubs[clubId];
  const t = sortTable(g.tables[c.div] ?? []);
  return t.findIndex((r) => r.club === clubId) + 1;
}

export const userFixture = (g: GameState): Fixture | undefined =>
  g.fixtures.find((f) => f.step === g.step && !f.played && (f.home === g.userClub || f.away === g.userClub));
export const currentStep = (g: GameState) => g.steps[g.step];
export const userFixtures = (g: GameState) => g.fixtures.filter((f) => f.home === g.userClub || f.away === g.userClub);

// ---------- lineups & setups ----------
export function fixLineup(g: GameState) {
  const sq = pickable(userSquad(g));
  const ids = new Set(sq.map((p) => p.id));
  const t = g.tactics;
  const slots = slotsOf(t);
  const seen = new Set<number>();
  const cleaned = slots.map((_, i) => {
    const id = t.lineup[i];
    if (id !== undefined && ids.has(id) && !seen.has(id)) {
      seen.add(id);
      return id;
    }
    return -1;
  });
  if (cleaned.includes(-1)) {
    const rest = sq.filter((p) => !seen.has(p.id));
    const auto = autoLineup([...rest], slots);
    const pool = rest.slice();
    cleaned.forEach((id, i) => {
      if (id !== -1) return;
      // pick best remaining for this slot position
      let bp: Player | null = null;
      let bs = -1;
      for (const p of pool) {
        const s = p.ovr * (fit(p, slots[i].pos) >= 0.99 ? 1 : p.pos === 'GK' || slots[i].pos === 'GK' ? 0.35 : 0.8);
        if (s > bs) {
          bs = s;
          bp = p;
        }
      }
      if (bp) {
        pool.splice(pool.indexOf(bp), 1);
        cleaned[i] = bp.id;
      }
    });
    void auto;
  }
  t.lineup = cleaned;
  if (!ids.has(t.captain) || !cleaned.includes(t.captain)) t.captain = best(cleaned.map((id) => P(g, id)).filter(Boolean))?.id ?? cleaned[0];
}

function colorDist(a: string, b: string) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

export function makeSetup(g: GameState, clubId: number, kit: 'home' | 'away', vs?: Club): Setup {
  const club = g.clubs[clubId];
  const isUser = clubId === g.userClub;
  let formation = club.formation;
  let slots: Setup['slots'];
  let lineupIds: number[];
  let mentality: Setup['mentality'] = 1;
  let style: Setup['style'] = 'short';
  let captain = -1;
  const sq = squadOf(g, clubId);
  if (isUser) {
    fixLineup(g);
    formation = g.tactics.formation;
    slots = slotsOf(g.tactics);
    lineupIds = g.tactics.lineup;
    mentality = g.tactics.mentality;
    style = g.tactics.style;
    captain = g.tactics.captain;
  } else {
    lineupIds = autoLineup(pickable(sq), formation);
    mentality = club.rep > 50 ? 2 : 1;
    style = (['short', 'long', 'counter'] as const)[club.id % 3];
    captain = best(lineupIds.map((id) => P(g, id)))?.id ?? -1;
  }
  const lineup = lineupIds.map((id) => P(g, id));
  if (lineup.some((p) => !p)) {
    // safety net: fill empty slots so a match can always be played
    const pool = pickable(sq).filter((p) => !lineupIds.includes(p.id));
    for (let i = 0; i < lineup.length; i++) {
      if (!lineup[i]) {
        const p = pool.shift();
        if (p) lineup[i] = p;
      }
    }
  }
  const bench = sq.filter((p) => !lineupIds.includes(p.id) && !unavailable(p)).sort((a, b) => b.ovr - a.ovr).slice(0, 7);
  let color = club.color;
  let color2 = club.color2;
  if (kit === 'away') {
    color = club.awayColor;
    color2 = club.awayColor2;
  }
  void vs;
  return { clubId, name: club.name, color, color2, gkColor: '#22b573', formation, slots, mentality, style, lineup, bench, captainId: captain, isUser, pattern: club.kitPattern ?? 0 };
}

/** Pick kits so shirts do not clash. */
export function matchSetups(g: GameState, fx: Pick<Fixture, 'home' | 'away'>): [Setup, Setup] {
  const h = makeSetup(g, fx.home, 'home');
  let a = makeSetup(g, fx.away, 'away');
  const ac = g.clubs[fx.away];
  if (colorDist(h.color, ac.color) > 120) a = makeSetup(g, fx.away, 'home');
  if (colorDist(h.color, a.color) < 90) {
    a.color = '#ffffff';
    a.color2 = '#222b45';
  }
  a.gkColor = colorDist(a.gkColor, h.gkColor) < 10 ? '#ff8c1a' : '#ff8c1a';
  h.gkColor = '#22b573';
  return [h, a];
}

// ---------- results ----------
function winnerOf(f: Fixture): number {
  if (f.hg !== f.ag) return f.hg > f.ag ? f.home : f.away;
  const p = f.pens ?? [1, 0];
  return p[0] > p[1] ? f.home : f.away;
}

export function applyResult(g: GameState, f: Fixture, res: MatchResult) {
  f.hg = res.score[0];
  f.ag = res.score[1];
  f.played = true;
  f.scorers = res.events
    .filter((e) => e.type === 'goal' && e.pid !== undefined && e.side >= 0)
    .map((e) => ({ pid: e.pid!, name: P(g, e.pid!)?.name ?? '?', min: e.min, side: e.side as 0 | 1 }));
  if (f.comp !== 'league' && f.comp !== 'friendly' && f.hg === f.ag) {
    // penalty shootout: a bit of home/strength-neutral randomness
    let a = rnd(3, 5);
    let b = rnd(3, 5);
    if (a === b) R() < 0.5 ? a++ : b++;
    f.pens = [a, b];
  }
  const counts = f.comp !== 'friendly'; // friendlies never cost a ban or an injury
  if (counts) {
    // players who sat this match out have served one match of their ban
    for (const p of g.players) if ((p.clubId === f.home || p.clubId === f.away) && (p.ban ?? 0) > 0) p.ban = p.ban! - 1;
  }
  for (const ps of res.players) {
    const p = P(g, ps.pid);
    if (!p) continue;
    if (counts) applyDiscipline(g, p, ps);
    if (ps.secs < 20) continue;
    p.apps++;
    p.seasonApps++;
    p.goals += ps.goals;
    p.seasonGoals += ps.goals;
    p.assists += ps.assists;
    p.seasonAssists += ps.assists;
    p.ratingSum += ps.rating;
    p.seasonRating += ps.rating;
    if (p.clubId === g.userClub && p.training && ps.secs > 60) p.trainProgress += 4;
  }
  if (f.comp === 'league') {
    const rows = g.tables[f.div];
    const hr = rows.find((r) => r.club === f.home)!;
    const ar = rows.find((r) => r.club === f.away)!;
    hr.p++; ar.p++;
    hr.gf += f.hg; hr.ga += f.ag; ar.gf += f.ag; ar.ga += f.hg;
    if (f.hg > f.ag) { hr.w++; hr.pts += 3; ar.l++; }
    else if (f.hg < f.ag) { ar.w++; ar.pts += 3; hr.l++; }
    else { hr.d++; ar.d++; hr.pts++; ar.pts++; }
  }
}

function applyDiscipline(g: GameState, p: Player, ps: MatchResult['players'][number]) {
  const mine = p.clubId === g.userClub;
  if (ps.red) {
    p.ban = 1;
    if (mine) pushNews(g, 'info', `${p.name} was sent off and misses the next match.`);
  } else if (ps.yellow) {
    p.yellows = (p.yellows ?? 0) + 1;
    if (p.yellows >= YELLOW_LIMIT) {
      p.yellows = 0;
      p.ban = 1;
      if (mine) pushNews(g, 'info', `${p.name} has ${YELLOW_LIMIT} yellow cards and misses the next match.`);
    }
  }
  if (ps.injured) {
    // counted down once at the end of this matchday, so 2..5 means 1..4 matches missed
    p.injury = rnd(2, 5);
    if (mine) pushNews(g, 'info', `${p.name} is injured and will be out for ${p.injury - 1} matchdays.`);
  }
}

function simAI(g: GameState, f: Fixture) {
  const [h, a] = matchSetups(g, f);
  applyResult(g, f, simulate(h, a));
}

export interface UserMatchOutcome {
  outcome: 'win' | 'draw' | 'loss';
  lines: string[];
  reward: number;
}

export function finishUserMatch(g: GameState, f: Fixture, res: MatchResult): UserMatchOutcome {
  applyResult(g, f, res);
  checkChallenge(g, f, res);
  const me = g.userClub;
  const mine = f.home === me ? f.hg : f.ag;
  const theirs = f.home === me ? f.ag : f.hg;
  let outcome: UserMatchOutcome['outcome'] = mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw';
  if (outcome === 'draw' && f.pens) {
    const mp = f.home === me ? f.pens[0] : f.pens[1];
    const tp = f.home === me ? f.pens[1] : f.pens[0];
    outcome = mp > tp ? 'win' : 'loss';
  }
  const lines: string[] = [];
  let reward = 0;
  const club = userClub(g);
  const win = tv('reward.winCoins');
  const derby = f.comp !== 'friendly' && f.comp !== 'continental' && isDerby(g, f);
  const dbf = derby ? 1.5 : 1;
  const bonus = Math.round((outcome === 'win' ? win : outcome === 'draw' ? Math.round(win / 3) : Math.round(win / 6)) * dbf);
  reward += bonus;
  addMoney(g, bonus, `${f.comp === 'friendly' ? 'Friendly' : 'Match'} reward (${outcome})`);
  lines.push(`🪙 Match reward +${bonus}`);
  if (f.home === me && f.comp !== 'friendly') {
    const gate = Math.round(([2000, 3000, 4500, 3500][club.stadium] ?? 2000) * (0.3 + club.rep / 100) * 0.12 * (1 + 0.2 * (g.facilities.stadium - 1)));
    reward += gate;
    addMoney(g, gate, 'Ticket sales');
    lines.push(`🎟️ Ticket sales +${gate}`);
  }
  if (f.comp === 'continental') {
    continentalOutcome(g, f);
    return { outcome, lines, reward };
  }
  if (f.comp !== 'friendly') {
    g.gf += mine;
    g.ga += theirs;
    if (mine > theirs) g.wins++;
    else if (mine < theirs) g.losses++;
    else g.draws++;
    const dr = outcome === 'win' ? 1.2 : outcome === 'draw' ? 0.3 : -0.4;
    club.rep = clamp(club.rep + dr + (derby ? (outcome === 'win' ? 1 : outcome === 'loss' ? -0.6 : 0.2) : 0), 1, 100);
    const opp = g.clubs[f.home === me ? f.away : f.home].name;
    if (derby) pushNews(g, outcome === 'win' ? 'win' : 'info', outcome === 'win' ? `🔥 Derby glory! ${club.name} ${mine}-${theirs} ${opp} — the town is yours!` : outcome === 'draw' ? `🔥 Derby: ${club.name} ${mine}-${theirs} ${opp} — honours even.` : `🔥 Derby pain: ${club.name} ${mine}-${theirs} ${opp}. Get them back next time!`);
    else if (outcome === 'win') pushNews(g, 'win', `${club.name} ${mine}-${theirs} ${opp} — what a win!`);
  } else {
    g.friendlies.unshift(f);
    if (g.friendlies.length > 20) g.friendlies.length = 20;
    checkAchievements(g);
    return { outcome, lines, reward };
  }
  // simulate the rest of this step and move on
  completeStep(g);
  return { outcome, lines, reward };
}

export function playFriendly(g: GameState, opp: number, home: boolean): Fixture {
  return newFixture(g, 'friendly', -1, 0, home ? g.userClub : opp, home ? opp : g.userClub, -1, 'Friendly Match');
}

export function skipStep(g: GameState) {
  if (userFixture(g)) return;
  completeStep(g);
}

/** A fresh chairman challenge for this week's match (friendly weeks get none). */
export function regenChallenge(g: GameState) {
  const f = userFixture(g);
  const derby = f && (f.home === g.rival || f.away === g.rival);
  const pool: Challenge['kind'][] = derby ? ['derby'] : ['win', 'win2', 'clean', 'three', 'young'];
  const kind = pool[rnd(0, pool.length - 1)];
  const reward = { win: 60, win2: 90, clean: 80, three: 90, young: 70, derby: 120 }[kind];
  const text = {
    win: "Chairman: win this week's match.",
    win2: 'Chairman: win by 2 or more goals.',
    clean: 'Chairman: keep a clean sheet.',
    three: 'Chairman: score 3 or more goals.',
    young: 'Chairman: win with a teenager in the starting eleven.',
    derby: 'Chairman: win the derby!',
  }[kind];
  g.challenge = { kind, text, reward, done: false };
}

export const isDerby = (g: GameState, f: Pick<Fixture, 'home' | 'away'>) =>
  g.rival !== undefined && (f.home === g.rival || f.away === g.rival) && (f.home === g.userClub || f.away === g.userClub);

/** Evaluate the week's chairman challenge after a played match. */
function checkChallenge(g: GameState, f: Fixture, res: MatchResult) {
  const c = g.challenge;
  if (!c || c.done || f.comp === 'friendly' || f.comp === 'continental') return;
  const me = f.home === g.userClub;
  const mine = me ? f.hg : f.ag;
  const theirs = me ? f.ag : f.hg;
  const won = mine > theirs || (!f.pens ? mine > theirs : me ? f.pens[0] > f.pens[1] : f.pens[1] > f.pens[0]);
  const ok =
    (c.kind === 'win' && won) ||
    (c.kind === 'win2' && won && mine - theirs >= 2) ||
    (c.kind === 'clean' && won && theirs === 0) ||
    (c.kind === 'three' && mine >= 3 && won) ||
    (c.kind === 'young' && won && g.tactics.lineup.some((id) => P(g, id)?.age !== undefined && P(g, id)!.age <= 18)) ||
    (c.kind === 'derby' && won);
  if (!ok) {
    g.challenge = null; // missed: next week brings a fresh one
    return;
  }
  c.done = true;
  addMoney(g, c.reward, 'Chairman challenge reward');
  pushNews(g, 'win', `Challenge complete: +{n} coins!`.replace('{n}', String(c.reward)));
}

// ---------- real-world clubs ----------
/** Stable hash of a club name, so the same club always gets the same colours and badge. */
function nameHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The club a real player belongs to, added to the world the first time one of its players
 * arrives. It trades like any other club but never enters a league, cup or tournament.
 * Returns an existing club with that name when the world already has one.
 */
export function ensureRealClub(g: GameState, name: string): number {
  const clean = name.trim();
  const found = g.clubs.find((c) => c.name.toLowerCase() === clean.toLowerCase());
  if (found) return found.id;
  const id = g.clubs.length;
  const h = nameHash(clean);
  const pal = PALETTE[h % PALETTE.length];
  g.clubs.push({
    id, name: clean, icon: h % ICONS.length, color: pal[0], color2: pal[1], awayColor: pal[1], awayColor2: pal[0],
    div: 3, rep: 72, stadium: 3, formation: FORMATION_IDS[h % FORMATION_IDS.length] as FormationId,
    isUser: false, foreign: true, imported: true,
  });
  return id;
}

/** True for a club from abroad: a Champions Cup guest or a real-world club. */
export const isForeignClub = (g: GameState, clubId: number) => !!g.clubs[clubId]?.foreign;

// ---------- Champions Cup: guest clubs from abroad ----------
const FOREIGN_BASE_ID = 1000; // foreign guest clubs get high club ids
const FOREIGN_NAMES = [
  ['Atlas Lions', '#0b6e4f', '#ffffff'], ['Kooru Kings', '#1d6fe0', '#ffd23f'], ['Vulkan Vikins', '#2d2d3a', '#ff5a5f'],
  ['Sakura Stars', '#ff8ab5', '#1d2b53'], ['Nordkap Nix', '#5b4bdb', '#ffffff'], ['Laguna Lights', '#00b3b3', '#ffe66d'],
];

/** Build the three guest champion clubs for this season's Champions Cup. */
function buildContinental(g: GameState) {
  const cont = g.continental!;
  const base = Math.round(mineAvgOvr(g));
  const r = mulberry(g.seed + g.season * 7 + 3);
  const used = new Set(g.players.map((p) => p.name));
  // a returning champion meets the same guests again, brought up to its new level
  const guests = g.clubs.filter((c) => c.foreign && !c.imported).slice(0, 3);
  if (guests.length === 3) {
    guests.forEach((c, i) => {
      const sq = g.players.filter((p) => p.clubId === c.id);
      const lift = base + [1, 5, 9][i] - Math.round(sq.reduce((a, p) => a + p.ovr, 0) / Math.max(1, sq.length));
      for (const p of sq) {
        p.ovr = clamp(p.ovr + lift, 30, 96);
        p.pot = Math.max(p.pot, p.ovr);
        p.value = calcValue(p.ovr, p.pot, p.age);
      }
    });
    cont.foreignIds = guests.map((c) => c.id);
    return;
  }
  for (let i = 0; i < 3; i++) {
    const id = g.clubs.length;
    const [name, color, color2] = FOREIGN_NAMES[i];
    const club = { id, name, icon: (i * 7 + 1) % ICONS.length, color, color2, awayColor: color2, awayColor2: color, div: 3, rep: 70 + i * 8, stadium: 3, formation: FORMATION_IDS[id % 5] as FormationId, isUser: false, foreign: true };
    g.clubs.push(club);
    const ovr = base + [1, 5, 9][i];
    for (const pos of SQUAD_SHAPE) {
      const np = makePlayer(r, g.players.length, pos as Pos, ovr + ri(r, -3, 3), 19, 28, id, used);
      np.pot = clamp(np.ovr + ri(r, 1, 5), np.ovr, 96);
      np.value = calcValue(np.ovr, np.pot, np.age);
      np.salary = calcSalary(np.value);
      g.players.push(np);
    }
    cont.foreignIds.push(id);
  }
  ensureNumbers(g);
}

const mineAvgOvr = (g: GameState) => {
  const xi = g.tactics.lineup.map((id) => P(g, id)).filter(Boolean);
  return xi.reduce((s, p) => s + p.ovr, 0) / (xi.length || 1);
};

/** Create the next Champions Cup fixture, played like a friendly (it does not advance the week). */
export function playContinental(g: GameState): Fixture | null {
  const cont = g.continental;
  if (!cont || !cont.qualified || cont.failed) return null;
  if (!cont.foreignIds.length) buildContinental(g); // safety: the guest clubs always exist before a round
  const oppId = cont.foreignIds[cont.round];
  const f = newFixture(g, 'continental', -2, cont.round, g.userClub, oppId, -1, `🌍 Champions Cup · Round ${cont.round + 1}`);
  cont.oppId = oppId;
  return f;
}

/** Win or lose a Champions Cup round. */
export function continentalOutcome(g: GameState, f: Fixture) {
  const cont = g.continental!;
  const mine = f.home === g.userClub ? f.hg : f.ag;
  const theirs = f.home === g.userClub ? f.ag : f.hg;
  const won = mine > theirs || (f.pens ? (f.home === g.userClub ? f.pens[0] > f.pens[1] : f.pens[1] > f.pens[0]) : mine > theirs);
  if (won) {
    cont.round++;
    addMoney(g, 800, 'Champions Cup round bonus');
    pushNews(g, 'win', `🌍 Champions Cup: you beat {a} and reach the next round!`.replace('{a}', g.clubs[f.home === g.userClub ? f.away : f.home].name));
    if (cont.round >= 3) {
      cont.qualified = false;
      cont.round = 0;
      g.trophies.push({ season: g.season, name: '🌍 Champions Cup', icon: '🌍' });
      addMoney(g, 5000, 'Champions of the continent prize');
      userClub(g).rep = clamp(userClub(g).rep + 10, 1, 100);
      pushNews(g, 'trophy', '🌍 CHAMPIONS OF THE CONTINENT! The whole world knows your club now!');
    }
  } else {
    cont.qualified = false;
    cont.failed = true;
    pushNews(g, 'info', 'You are out of the Champions Cup. Win the top flight again to return!');
  }
  checkAchievements(g);
}

// ---------- kit shop ----------
export const KIT_PATTERNS = ['Solid', 'Vertical stripes', 'Hoops', 'Halves'];
export const kitPrice = (p: number) => [0, 400, 400, 600][p] ?? 0;

export function buyKit(g: GameState, pattern: number): string | null {
  g.kitOwned ??= [0];
  if (g.kitOwned.includes(pattern)) return 'You already own this kit.';
  const price = kitPrice(pattern);
  if (g.balance < price) return 'Not enough coins.';
  addMoney(g, -price, `Kit: ${KIT_PATTERNS[pattern]}`);
  g.kitOwned!.push(pattern);
  return null;
}

export function wearKit(g: GameState, pattern: number): string | null {
  g.kitOwned ??= [0];
  if (!g.kitOwned.includes(pattern)) return 'Buy the kit first.';
  userClub(g).kitPattern = pattern;
  return null;
}

function completeStep(g: GameState) {
  for (const f of g.fixtures) if (f.step === g.step && !f.played) simAI(g, f);
  const st = g.steps[g.step];
  const here = g.fixtures.filter((f) => f.step === g.step);
  const me = g.userClub;
  if (st.kind === 'cup') {
    g.cup.teams = here.map(winnerOf);
    g.cup.round++;
    if (g.cup.teams.length === 1) {
      g.cup.winner = g.cup.teams[0];
      pushNews(g, 'trophy', `${g.clubs[g.cup.winner].name} won the Kids Cup!`);
      if (g.cup.winner === me) {
        g.trophies.push({ season: g.season, name: 'Kids Cup', icon: '🏆' });
        addMoney(g, 1500, 'Cup winner prize');
        userClub(g).rep = clamp(userClub(g).rep + 6, 1, 100);
      }
    } else if (here.some((f) => f.home === me || f.away === me) && !g.cup.teams.includes(me)) {
      pushNews(g, 'info', `You were knocked out of the cup (${st.label}).`);
    }
  } else if (st.kind === 'tournament') {
    g.tourn.teams = here.map(winnerOf);
    g.tourn.round++;
    if (g.tourn.teams.length === 1) {
      g.tourn.winner = g.tourn.teams[0];
      pushNews(g, 'trophy', `${g.clubs[g.tourn.winner].name} won the Champions Tournament!`);
      if (g.tourn.winner === me) {
        g.trophies.push({ season: g.season, name: 'Champions Tournament', icon: '🥇' });
        addMoney(g, 4000, 'Tournament winner prize');
        userClub(g).rep = clamp(userClub(g).rep + 8, 1, 100);
      }
    }
  }
  weekly(g);
  checkAchievements(g);
  g.step++;
  if (g.step >= g.steps.length) endSeason(g);
  else prepareStep(g);
}

// ---------- weekly processing ----------
function weekly(g: GameState) {
  const club = userClub(g);
  const sq = userSquad(g);
  const wages = sq.reduce((s, p) => s + (p.loan ? Math.round(p.salary * (p.loan.share / 100)) : p.salary), 0);
  const sponsor = Math.round(30 + club.rep * 3);
  const upkeep = 8 * (g.facilities.training + g.facilities.stadium + g.facilities.youth);
  addMoney(g, sponsor, 'Sponsor money');
  addMoney(g, -wages, 'Player wages');
  addMoney(g, -upkeep, 'Facility upkeep');

  // injuries heal
  for (const p of g.players) {
    if ((p.injury ?? 0) <= 0) continue;
    p.injury = p.injury! - 1;
    if (p.injury === 0 && p.clubId === g.userClub) pushNews(g, 'info', `${p.name} is fit again!`);
  }
  fixLineup(g);

  // training
  for (const p of sq) {
    trainPosition(g, p);
    if (!p.training) continue;
    const ageF = p.age <= 20 ? 1.3 : p.age <= 25 ? 1.1 : p.age <= 30 ? 0.8 : 0.5;
    p.trainProgress += (tv('training.weeklyProgress') + g.facilities.training * 2.5 + rnd(0, 4)) * ageF;
    applyTrainProgress(g, p);
  }
  // loans
  for (const p of g.players) {
    if (p.loan && p.clubId === g.userClub && g.step >= p.loan.untilStep && p.loan.season === g.season) {
      p.clubId = p.loan.from;
      pushNews(g, 'loan', `${p.name}'s loan has ended and returned to ${g.clubs[p.loan.from]?.name}.`);
      delete p.loan;
    }
  }
  g.offers = g.offers.filter((o) => g.step - o.step < 3);
  genOffers(g);
  aiTransfers(g);
  trainAcademy(g);
  ensureNumbers(g);
  g.balanceHistory.push(g.balance);
  if (g.balanceHistory.length > 60) g.balanceHistory.shift();
  fixLineup(g);
}

export function applyTrainProgress(g: GameState, p: Player) {
  while (p.training && p.trainProgress >= 100) {
    const a = p.training;
    if (p[a] >= Math.min(99, p.pot + 12)) {
      p.trainProgress = 99;
      break;
    }
    p.trainProgress -= 100;
    p[a]++;
    const old = p.ovr;
    p.ovr = calcOvr(p);
    p.pot = Math.max(p.pot, p.ovr);
    p.value = calcValue(p.ovr, p.pot, p.age);
    p.salary = Math.max(p.salary, calcSalary(p.value));
    if (p.clubId === g.userClub) pushNews(g, 'info', `${p.name} improved ${ATTR_LABEL[a]} to ${p[a]}!${p.ovr > old ? ` Overall ${p.ovr}!` : ''}`);
  }
}

export function setTraining(g: GameState, pid: number, a: Attr | null) {
  const p = P(g, pid);
  if (p.training !== a) {
    p.training = a;
    p.trainProgress = 0;
  }
}

// ---------- position training ----------
export const MAX_EXTRA_POS = 2;

/** Positions this player can still learn. Goalkeeping is its own job: not learnable, and keepers stay keepers. */
export function learnablePositions(p: Player): Pos[] {
  if (p.pos === 'GK') return [];
  const known = [p.pos, ...(p.extraPos ?? [])];
  const all: Pos[] = ['CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];
  return all.filter((x) => !known.includes(x));
}

export function setPosTraining(g: GameState, pid: number, pos: Pos | null): string | null {
  const p = P(g, pid);
  if (pos === null) {
    p.posTraining = null;
    p.posProgress = 0;
    return null;
  }
  if ((p.extraPos ?? []).length >= MAX_EXTRA_POS) return `A player can learn up to ${MAX_EXTRA_POS} extra positions.`;
  if (!learnablePositions(p).includes(pos)) return 'This player cannot learn that position.';
  if (p.posTraining !== pos) {
    p.posTraining = pos;
    p.posProgress = 0;
  }
  return null;
}

/** Weekly step towards a new position. A position close to one already known is learned faster. */
function trainPosition(g: GameState, p: Player) {
  const target = p.posTraining;
  if (!target) return;
  const closeness = fit(p, target); // 0.74 unrelated .. 0.94 very similar
  const ageF = p.age <= 21 ? 1.3 : p.age <= 27 ? 1 : 0.7;
  p.posProgress = (p.posProgress ?? 0) + (5 + g.facilities.training * 1.5) * ageF * (1 + (closeness - 0.74) * 4);
  if (p.posProgress < 100) return;
  p.extraPos = [...(p.extraPos ?? []), target];
  p.posTraining = null;
  p.posProgress = 0;
  pushNews(g, 'info', `${p.name} learned a new position: ${target}!`);
}

export function intensiveSession(g: GameState, pid: number): string {
  const p = P(g, pid);
  const cost = 40;
  if (!p.training) return 'Choose a training type first!';
  if (g.balance < cost) return 'Not enough coins.';
  addMoney(g, -cost, `Intensive training: ${p.name}`);
  p.trainProgress += 35 + g.facilities.training * 3;
  applyTrainProgress(g, p);
  return `${p.name} trained hard! 💪`;
}

// ---------- transfers ----------
export const askPrice = (p: Player) => round10(p.value * (1.1 + (p.id % 7) * 0.03));
export function contractDemand(p: Player) {
  return { wage: Math.max(1, Math.round(p.salary * (1.0 + 0.1 * (p.id % 4)))), years: 1 + (p.id % 4) };
}
export function marketList(g: GameState): Player[] {
  return g.players.filter((p) => p.clubId !== g.userClub && p.clubId !== ACADEMY);
}

export type Neg = { status: 'accepted' | 'counter' | 'rejected'; counter?: number; msg: string };
export function negotiateFee(p: Player, offer: number, round: number): Neg {
  if (p.clubId === -1) return { status: 'accepted', msg: 'He is a free agent — no transfer fee!' };
  const ask = askPrice(p);
  if (offer >= ask) return { status: 'accepted', msg: 'Deal! The club accepts your offer.' };
  if (offer >= ask * 0.85 && round < 3) return { status: 'counter', counter: round10(ask * 0.97), msg: `Almost! The club asks for ${round10(ask * 0.97)} coins.` };
  return { status: 'rejected', msg: offer >= ask * 0.85 ? 'The club is out of patience. Try again later!' : 'That offer is way too low!' };
}
export function negotiateWage(p: Player, wage: number, round: number): Neg {
  const d = contractDemand(p).wage;
  if (wage >= d) return { status: 'accepted', msg: 'The player is happy and ready to sign!' };
  if (wage >= d * 0.75 && round < 3) {
    const c = Math.max(wage + 1, Math.round(d * 0.95));
    return { status: 'counter', counter: c, msg: `He wants ${c} coins per week.` };
  }
  return { status: 'rejected', msg: 'The player says no to that wage.' };
}

export function canBuy(g: GameState, p: Player, fee: number): string | null {
  if (userSquad(g).length >= MAX_SQUAD) return `Your squad is full (max ${MAX_SQUAD}).`;
  if (g.balance < fee) return 'Not enough coins for this deal.';
  if (p.clubId === g.userClub) return 'Already in your club.';
  return null;
}

export function buyPlayer(g: GameState, pid: number, fee: number, wage: number): string | null {
  const p = P(g, pid);
  const err = canBuy(g, p, fee);
  if (err) return err;
  const from = p.clubId;
  p.clubId = g.userClub;
  p.salary = wage;
  p.contract = contractDemand(p).years;
  delete p.loan;
  delete p.askPrice;
  addMoney(g, -fee, `Signed ${p.name}`);
  if (!g.cards.includes(p.id)) g.cards.push(p.id);
  pushNews(g, 'in', `${p.name} joins ${userClub(g).name}${from >= 0 ? ` from ${g.clubs[from].name}` : ' as a free agent'}! ${fee ? `(${fee} coins)` : ''}`);
  g.offers = g.offers.filter((o) => o.playerId !== pid);
  ensureNumbers(g);
  checkAchievements(g);
  return null;
}

export function loanFee(p: Player) {
  return round10(p.value * 0.06);
}
export function loanAccepts(p: Player, share: number): boolean {
  return share >= 60 || p.ovr < 55;
}
export function loanPlayer(g: GameState, pid: number, weeks: number, share: number): string | null {
  const p = P(g, pid);
  const fee = loanFee(p);
  if (p.clubId < 0) return 'Free agents can be signed directly.';
  if (userSquad(g).length >= MAX_SQUAD) return 'Your squad is full.';
  if (g.balance < fee) return 'Not enough coins.';
  if (!loanAccepts(p, share)) return 'The club wants you to pay a bigger share of the wage.';
  const from = p.clubId;
  p.loan = { from, untilStep: Math.min(g.steps.length - 1, g.step + weeks), share, season: g.season };
  p.clubId = g.userClub;
  addMoney(g, -fee, `Loan fee for ${p.name}`);
  if (!g.cards.includes(p.id)) g.cards.push(p.id);
  pushNews(g, 'loan', `${p.name} joins on loan from ${g.clubs[from].name} for ${weeks} weeks.`);
  ensureNumbers(g);
  return null;
}

export function listForSale(g: GameState, pid: number, price: number | null) {
  const p = P(g, pid);
  if (price === null) delete p.askPrice;
  else p.askPrice = price;
}

export function sellNow(g: GameState, pid: number, amount: number, to?: number): string | null {
  const p = P(g, pid);
  if (userSquad(g).length <= MIN_SQUAD) return `You need at least ${MIN_SQUAD} players in your squad.`;
  if (p.loan) return 'Loaned players cannot be sold.';
  const buyers = g.clubs.filter((c) => !c.isUser && !c.foreign);
  const club = to !== undefined ? g.clubs[to] : buyers[rnd(0, buyers.length - 1)];
  p.clubId = club.id;
  p.contract = 1 + (p.id % 3); // the buyer signs them on a fresh deal
  delete p.askPrice;
  addMoney(g, amount, `Sold ${p.name}`);
  pushNews(g, 'out', `${p.name} leaves ${userClub(g).name} for ${club.name} (${amount} coins).`);
  g.offers = g.offers.filter((o) => o.playerId !== pid);
  fixLineup(g);
  checkAchievements(g);
  return null;
}
export function acceptOffer(g: GameState, offerId: number): string | null {
  const o = g.offers.find((x) => x.id === offerId);
  if (!o) return 'Offer expired.';
  return sellNow(g, o.playerId, o.amount, o.from);
}
export function rejectOffer(g: GameState, offerId: number) {
  g.offers = g.offers.filter((x) => x.id !== offerId);
}

function genOffers(g: GameState) {
  const sq = userSquad(g).filter((p) => !p.loan);
  if (sq.length <= MIN_SQUAD) return;
  const buyers = g.clubs.filter((c) => !c.isUser && !c.foreign);
  const add = (p: Player, amount: number) => {
    if (g.offers.some((o) => o.playerId === p.id)) return;
    const from = buyers[rnd(0, buyers.length - 1)].id;
    const o = { id: g.offerId++, playerId: p.id, from, amount: round10(amount), step: g.step };
    g.offers.push(o);
    pushNews(g, 'info', `${g.clubs[from].name} bid ${o.amount} coins for ${p.name}.`);
  };
  for (const p of sq) {
    if (p.askPrice) {
      const ratio = p.askPrice / p.value;
      const chance = clamp(0.7 - (ratio - 0.8) * 1.2, 0.05, 0.8);
      if (R() < chance) add(p, Math.min(p.askPrice, p.value * (0.85 + R() * 0.3)) * (R() < 0.5 ? 1 : 0.92));
    }
  }
  if (R() < 0.2) {
    const p = sq[rnd(0, sq.length - 1)];
    add(p, p.value * (1 + R() * 0.4));
  }
}

function aiTransfers(g: GameState) {
  for (let k = 0; k < 2; k++) {
    const p = g.players[rnd(0, g.players.length - 1)];
    if (p.clubId === g.userClub || p.clubId === ACADEMY || p.clubId >= FOREIGN_BASE_ID || isForeignClub(g, p.clubId) || p.loan) continue;
    const dest = g.clubs
      .filter((c) => !c.isUser && !c.foreign && c.id !== p.clubId)
      .sort((a, b) => squadOf(g, a.id).filter((x) => x.pos === p.pos).length - squadOf(g, b.id).filter((x) => x.pos === p.pos).length);
    const to = dest[0];
    if (!to) continue;
    const destAvg = squadOf(g, to.id).reduce((s, q) => s + q.ovr, 0) / (squadOf(g, to.id).length || 1);
    if (p.ovr < destAvg - 6) continue; // only sign someone who actually improves them
    if (p.clubId >= 0) {
      const sq = squadOf(g, p.clubId);
      if (sq.length <= 14) continue;
      if (p.pos === 'GK' && sq.filter((x) => x.pos === 'GK').length <= 1) continue;
    }
    if (squadOf(g, to.id).length >= 20) continue;
    const from = p.clubId;
    p.clubId = to.id;
    delete p.askPrice;
    pushNews(g, 'info', `${p.name} (${p.pos}, ${p.ovr}) signs for ${to.name}${from >= 0 ? ` from ${g.clubs[from].name}` : ' as a free agent'}.`);
    break;
  }
}

// ---------- shirt numbers ----------
/** The numbers a position likes to wear, most wanted first. */
const SHIRTS: Record<Pos, number[]> = {
  GK: [1], CB: [4, 5], LB: [3], RB: [2], CDM: [6], CM: [8, 6], CAM: [10], LW: [11, 7], RW: [7, 11], ST: [9, 10],
};

/** Give every club player a shirt number that nobody else at the club wears. Players who keep a valid number are left alone. */
export function ensureNumbers(g: GameState) {
  for (const c of g.clubs) {
    const taken = new Set<number>();
    const need: Player[] = [];
    for (const p of squadOf(g, c.id)) {
      if (p.num && p.numClub === c.id && !taken.has(p.num)) taken.add(p.num);
      else need.push(p);
    }
    // the best players pick first, so the starters get the classic numbers
    need.sort((a, b) => b.ovr - a.ovr);
    for (const p of need) {
      let n = SHIRTS[p.pos].find((x) => !taken.has(x));
      if (n === undefined) {
        n = 12;
        while (taken.has(n) && n < 99) n++;
      }
      p.num = n;
      p.numClub = c.id;
      taken.add(n);
    }
  }
}

/** The shirt number shown for a player, or undefined when they have no club. */
export const shirtOf = (p: Pick<Player, 'num' | 'numClub' | 'clubId'>) => (p.clubId >= 0 && p.numClub === p.clubId ? p.num : undefined);

/** Newer fields for old saves: eternal rival, challenge slot, kit shop, Champions Cup. */
export function ensureExtras(g: GameState) {
  if (g.rival === undefined) {
    const me = g.clubs[g.userClub];
    g.rival = g.clubs.find((c) => !c.isUser && c.div === me.div)!.id;
  }
  g.kitOwned ??= [0];
  g.continental ??= null;
  g.challenge ??= null;
}

/** Old saves had no contracts; hand those out once. New players get one when they are created. */
export function ensureContracts(g: GameState) {
  for (const p of g.players) {
    if (p.clubId >= 0 && p.contract === undefined) p.contract = 1 + (p.id % 3);
  }
}

export const renewalFee = (p: Player) => Math.max(30, Math.round((p.value * 0.1) / 10) * 10);

/** Extend a contract by 2 seasons for a signing bonus. */
export function renewContract(g: GameState, pid: number): string | null {
  const p = P(g, pid);
  if (!p || p.clubId !== g.userClub) return 'Only your own players can renew.';
  const fee = renewalFee(p);
  if (g.balance < fee) return 'Not enough coins for the signing bonus.';
  addMoney(g, -fee, `Contract renewal bonus for ${p.name}`);
  p.contract = Math.min(4, (p.contract ?? 0) + 2);
  return null;
}

/** Change a user player's number. If a team-mate wears it, the two swap. */
export function setNumber(g: GameState, pid: number, n: number): string | null {
  const p = P(g, pid);
  if (!p || p.clubId !== g.userClub) return 'Only your own players can change number.';
  if (!Number.isInteger(n) || n < 1 || n > 99) return 'Pick a number from 1 to 99.';
  const other = userSquad(g).find((q) => q.id !== pid && q.num === n);
  if (other) other.num = p.num;
  p.num = n;
  p.numClub = g.userClub;
  return null;
}

// ---------- youth academy ----------
/** How many young players join the academy each season. */
export const academyIntakeSize = (lvl: number) => 2 + (lvl >= 3 ? 1 : 0) + (lvl >= 5 ? 1 : 0);

function academyIntake(g: GameState, r: () => number, used: Set<string>) {
  const lvl = g.facilities.youth;
  const room = ACADEMY_MAX - academyOf(g).length;
  const n = Math.min(academyIntakeSize(lvl), room);
  const names: string[] = [];
  for (let i = 0; i < n; i++) {
    const pos = SQUAD_SHAPE[ri(r, 0, SQUAD_SHAPE.length - 1)];
    const np = makePlayer(r, g.players.length, pos, 30 + lvl * 4 + ri(r, 0, 4), 14, 16, ACADEMY, used);
    np.pot = clamp(np.ovr + 16 + lvl * 3 + ri(r, 0, 8), np.ovr, 96);
    np.value = calcValue(np.ovr, np.pot, np.age);
    np.salary = calcSalary(np.value);
    g.players.push(np);
    names.push(np.name);
  }
  if (n > 0) pushNews(g, 'in', `Youth academy: new kids joined — ${names.join(', ')}.`);
  if (n < academyIntakeSize(lvl)) pushNews(g, 'info', 'The youth academy is full — promote or release players to make room.');
}

/** First group of academy players, for a new game or a save made before the academy existed. */
export function openAcademy(g: GameState) {
  if (g.academyOpen) return;
  g.academyOpen = true;
  const used = new Set(g.players.map((p) => p.name));
  academyIntake(g, mulberry(g.seed + 977 + g.season), used);
}

/** Academy players get a little better every week; a better academy teaches faster. */
function trainAcademy(g: GameState) {
  const chance = tv('academy.growthChance') + g.facilities.youth * 0.05;
  for (const p of academyOf(g)) {
    for (let k = 0; k < 3; k++) {
      if (p.ovr >= p.pot || R() >= chance) continue;
      const a = ATTRS[rnd(0, ATTRS.length - 1)];
      p[a] = clamp(p[a] + 1, 12, 97);
      p.ovr = calcOvr(p);
    }
    p.value = calcValue(p.ovr, p.pot, p.age);
    p.salary = calcSalary(p.value);
  }
}

export function promoteYouth(g: GameState, pid: number): string | null {
  const p = P(g, pid);
  if (!p || p.clubId !== ACADEMY) return 'This player is not in the academy.';
  if (userSquad(g).length >= MAX_SQUAD) return `Your squad is full (max ${MAX_SQUAD}).`;
  p.clubId = g.userClub;
  p.contract = 2;
  if (!g.cards.includes(p.id)) g.cards.push(p.id);
  ensureNumbers(g);
  pushNews(g, 'in', `Youth academy: ${p.name} (${p.pos}, pot ${p.pot}) joins the first team!`);
  checkAchievements(g);
  return null;
}

export function releaseYouth(g: GameState, pid: number): string | null {
  const p = P(g, pid);
  if (!p || p.clubId !== ACADEMY) return 'This player is not in the academy.';
  p.clubId = -1;
  pushNews(g, 'out', `${p.name} was released from the academy.`);
  return null;
}

// ---------- facilities ----------
export const facilityCost = (lvl: number) => Math.round(600 * Math.pow(lvl, 1.5));
export function upgradeFacility(g: GameState, key: keyof GameState['facilities']): string | null {
  const lvl = g.facilities[key];
  if (lvl >= 5) return 'Already at max level!';
  const cost = facilityCost(lvl);
  if (g.balance < cost) return 'Not enough coins.';
  addMoney(g, -cost, `Upgraded ${key} facility`);
  g.facilities[key]++;
  userClub(g).rep = clamp(userClub(g).rep + 1.5, 1, 100);
  pushNews(g, 'info', `${key[0].toUpperCase() + key.slice(1)} facility upgraded to level ${lvl + 1}!`);
  checkAchievements(g);
  return null;
}

// ---------- achievements ----------
export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  check: (g: GameState) => boolean;
}
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_win', icon: '🎉', title: 'First Victory', desc: 'Win a match.', check: (g) => g.wins >= 1 },
  { id: 'wins5', icon: '🔥', title: 'On Fire', desc: 'Win 5 matches.', check: (g) => g.wins >= 5 },
  { id: 'wins20', icon: '🏅', title: 'Winning Machine', desc: 'Win 20 matches.', check: (g) => g.wins >= 20 },
  { id: 'goals10', icon: '⚽', title: 'Goal Party', desc: 'Score 10 goals.', check: (g) => g.gf >= 10 },
  { id: 'goals50', icon: '🚀', title: 'Goal Rocket', desc: 'Score 50 goals.', check: (g) => g.gf >= 50 },
  { id: 'first_buy', icon: '✍️', title: 'First Signing', desc: 'Sign a new player.', check: (g) => g.news.some((n) => n.kind === 'in') },
  { id: 'first_sell', icon: '💸', title: 'Smart Seller', desc: 'Sell a player.', check: (g) => g.news.some((n) => n.kind === 'out') },
  { id: 'cup', icon: '🏆', title: 'Cup Winners', desc: 'Win the Kids Cup.', check: (g) => g.trophies.some((t) => t.name === 'Kids Cup') },
  { id: 'league', icon: '👑', title: 'League Champions', desc: 'Win a league.', check: (g) => g.trophies.some((t) => t.name.includes('League')) },
  { id: 'tourn', icon: '🥇', title: 'Tournament Hero', desc: 'Win the Champions Tournament.', check: (g) => g.trophies.some((t) => t.name === 'Champions Tournament') },
  { id: 'promo', icon: '⬆️', title: 'Going Up!', desc: 'Get promoted.', check: (g) => g.history.some((h) => h.div < 2 && h.pos > 0 && g.achievements.promo_flag !== undefined) || g.clubs[g.userClub].div < 2 },
  { id: 'rich', icon: '💰', title: 'Rich Club', desc: 'Have 10,000 coins.', check: (g) => g.balance >= 10000 },
  { id: 'star', icon: '⭐', title: 'Star Player', desc: 'Own a player with 70+ overall.', check: (g) => userSquad(g).some((p) => p.ovr >= 70) },
  { id: 'fac3', icon: '🏗️', title: 'Builder', desc: 'Upgrade any facility to level 3.', check: (g) => Object.values(g.facilities).some((l) => l >= 3) },
  { id: 'trainer', icon: '💪', title: 'Great Coach', desc: 'Make a player gain +5 overall.', check: (g) => userSquad(g).some((p) => p.ovr - p.ovrHistory[0] >= 5) },
  { id: 'rep50', icon: '🌟', title: 'Famous Club', desc: 'Reach 50 reputation.', check: (g) => userClub(g).rep >= 50 },
];

export function checkAchievements(g: GameState) {
  for (const a of ACHIEVEMENTS) {
    if (g.achievements[a.id] === undefined && a.check(g)) {
      g.achievements[a.id] = g.season;
      addMoney(g, 100, `Achievement: ${a.title}`);
      pushNews(g, 'trophy', `Achievement unlocked: ${a.icon} ${a.title}! (+100 coins)`);
    }
  }
}

// ---------- season end ----------
function developPlayer(p: Player, youthBoost: number) {
  p.age++;
  const young = p.age <= 24;
  for (const a of ATTRS) {
    let d = 0;
    if (young && p.ovr < p.pot) d = rnd(0, 3) + youthBoost;
    else if (p.age <= 28) d = rnd(-1, 1);
    else if (p.age <= 31) d = rnd(-2, 0);
    else d = rnd(-3, -1);
    if ((a === 'speed' || a === 'stamina') && p.age >= 29) d -= 1;
    p[a] = clamp(p[a] + d, 12, 97);
  }
  p.ovr = calcOvr(p);
  if (p.age > 28) p.pot = p.ovr;
  else p.pot = Math.max(p.ovr, p.pot - (young ? 0 : 1));
  p.value = calcValue(p.ovr, p.pot, p.age);
  p.salary = calcSalary(p.value);
  p.ovrHistory.push(p.ovr);
  if (p.ovrHistory.length > 12) p.ovrHistory.shift();
  p.seasonGoals = p.seasonAssists = p.seasonApps = p.seasonRating = 0;
  // a new season starts with a clean slate
  p.yellows = 0;
  p.ban = 0;
  p.injury = 0;
}

function endSeason(g: GameState) {
  const me = g.userClub;
  const club = userClub(g);
  const oldDiv = club.div;
  const tbl = sortTable(g.tables[oldDiv]);
  const pos = tbl.findIndex((r) => r.club === me) + 1;
  const lines: string[] = [];
  const base = [6000, 3000, 1500][oldDiv];
  const prize = Math.round(base * (pos === 1 ? 1 : pos === 2 ? 0.5 : pos <= 4 ? 0.25 : 0.1));
  addMoney(g, prize, `Season prize (${pos}${pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'})`);
  lines.push(`Finished ${pos}${pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'} in the ${divName(oldDiv)}. Prize: 🪙 ${prize}`);
  let result: 'promoted' | 'relegated' | 'stay' | 'champion' = 'stay';
  if (pos === 1) {
    g.trophies.push({ season: g.season, name: `${divName(oldDiv)} Champions`, icon: oldDiv === 0 ? '👑' : '🏆' });
    club.rep = clamp(club.rep + 8, 1, 100);
    result = 'champion';
    lines.push(`🏆 You are ${divName(oldDiv)} champions!`);
    if (oldDiv === 0 && !g.continental?.qualified) {
      g.continental = { qualified: true, failed: false, round: 0, oppId: -1, foreignIds: [] };
      buildContinental(g);
      lines.push('🌍 You will represent the league in the Champions Cup!');
      pushNews(g, 'info', '🌍 Champions Cup: you qualified as champions! Play it from the Home screen.');
    }
  }
  // promotion & relegation for everybody
  const moves: [number, number][] = [];
  for (let d = 0; d < 3; d++) {
    const t = sortTable(g.tables[d]);
    if (d > 0) t.slice(0, 2).forEach((r) => moves.push([r.club, d - 1]));
    if (d < 2) t.slice(-2).forEach((r) => moves.push([r.club, d + 1]));
  }
  for (const [cid, nd] of moves) {
    g.clubs[cid].div = nd;
    if (cid === me) {
      result = nd < oldDiv ? (result === 'champion' ? 'champion' : 'promoted') : 'relegated';
      lines.push(nd < oldDiv ? `⬆️ Promoted to the ${divName(nd)}!` : `⬇️ Relegated to the ${divName(nd)}. Chin up — build again!`);
      club.rep = clamp(club.rep + (nd < oldDiv ? 5 : -3), 1, 100);
    }
  }
  g.history.push({ season: g.season, div: oldDiv, pos });
  // the rival has to share your division, or there is no derby to play
  if (g.rival === undefined || g.clubs[g.rival]?.div !== club.div) {
    const near = g.clubs.filter((c) => !c.isUser && c.div === club.div).sort((a, b) => Math.abs(a.rep - club.rep) - Math.abs(b.rep - club.rep))[0];
    if (near) {
      g.rival = near.id;
      pushNews(g, 'info', `🔥 New rival: ${near.name}! Two derbies await this season.`);
    }
  }
  if (club.div < 2 || result === 'promoted' || result === 'champion') g.achievements.promo_flag = g.season;
  // development
  const youthBoost = 0;
  for (const p of g.players) {
    if (p.loan && p.loan.season === g.season) {
      p.clubId = p.loan.from;
      delete p.loan;
    }
    developPlayer(p, p.clubId === me ? Math.floor((g.facilities.training - 1) / 2) + youthBoost : p.clubId === ACADEMY ? Math.floor((g.facilities.youth - 1) / 2) : 0);
  }
  // CPU clubs push their own best young players, scaled by their division
  for (const c of g.clubs) {
    if (c.isUser || c.div > 2) continue;
    const young = squadOf(g, c.id).filter((p) => p.age <= 21 && p.ovr < p.pot).sort((a, b) => b.ovr - a.ovr).slice(0, 2);
    for (const p of young) {
      p.ovr = clamp(p.ovr + rnd(1, 2) + (2 - c.div), p.ovr, p.pot);
      p.value = calcValue(p.ovr, p.pot, p.age);
    }
  }
  // retirements
  const used = new Set(g.players.map((p) => p.name));
  const r = mulberry(g.seed + g.season * 31);
  for (const p of g.players) {
    // a catalogue player keeps his identity; the next catalogue refresh brings his real age and club
    if (p.catalogId !== undefined) continue;
    if (p.age >= 36 && p.clubId !== me) {
      const pos = p.pos;
      const np = makePlayer(r, p.id, pos, clamp(p.ovr - 6, 30, 70), 16, 19, p.clubId, used);
      Object.assign(p, np);
    } else if (p.age >= 36 && p.clubId === me) {
      p.clubId = -1;
      pushNews(g, 'out', `${p.name} retired from ${club.name}. Thank you for everything!`);
    }
  }
  // contracts: CPU clubs renew quietly; the user's expiring players leave, but never below the squad minimum
  const expiringUser = g.players.filter((p) => p.clubId === me && !p.loan && p.contract === 1).sort((a, b) => a.ovr - b.ovr);
  const leaving = new Set(expiringUser.slice(0, Math.max(0, userSquad(g).length - MIN_SQUAD)).map((p) => p.id));
  for (const p of g.players) {
    if (p.clubId < 0 || (p.loan && p.clubId === me)) continue; // loaned-in players keep their old deal
    if (p.contract === undefined) continue;
    p.contract--;
    if (p.contract > 0) {
      if (p.clubId === me && p.contract === 1) pushNews(g, 'info', `{a} enters the final season of their contract.`.replace('{a}', p.name));
      continue;
    }
    if (p.clubId === me) {
      if (leaving.has(p.id)) {
        p.clubId = -1;
        delete p.askPrice;
        pushNews(g, 'out', `{a}'s contract ended and they left the club.`.replace('{a}', p.name));
      } else {
        p.contract = 1;
        pushNews(g, 'info', `{a} signs a one-season contract extension.`);
      }
    } else {
      p.contract = 1 + (p.id % 3); // CPU clubs renew quietly
    }
  }
  // CPU squads topped up
  for (const c of g.clubs) {
    if (c.isUser || c.foreign) continue;
    let sq = squadOf(g, c.id);
    while (sq.length < 16) {
      const counts: Record<string, number> = {};
      sq.forEach((p) => (counts[p.pos] = (counts[p.pos] ?? 0) + 1));
      const need = SQUAD_SHAPE.find((pos) => (counts[pos] ?? 0) < SQUAD_SHAPE.filter((x) => x === pos).length) ?? 'CM';
      const np = makePlayer(r, g.players.length, need as Pos, [64, 55, 46][c.div] - 4 + ri(r, -4, 4), 16, 20, c.id, used);
      g.players.push(np);
      sq = squadOf(g, c.id);
    }
  }
  // youth academy: the oldest leave, a new group arrives
  for (const p of academyOf(g)) {
    if (p.age <= ACADEMY_AGE) continue;
    p.clubId = -1;
    pushNews(g, 'out', `${p.name} was too old for the academy and left the club.`);
  }
  academyIntake(g, r, used);
  g.balanceHistory.push(g.balance);
  g.seasonSummary = { season: g.season, div: oldDiv, pos, result, prize, lines };
  g.season++;
  g.offers = [];
  startSeason(g);
  fixLineup(g);
  ensureNumbers(g);
  checkAchievements(g);
}

// ---------- stats helpers ----------
export function leagueClubIds(g: GameState, div: number) {
  return g.clubs.filter((c) => c.div === div).map((c) => c.id);
}
export function topPlayers(g: GameState, div: number, key: 'seasonGoals' | 'seasonAssists' | 'rating', n = 10): Player[] {
  const ids = new Set(leagueClubIds(g, div));
  const list = g.players.filter((p) => ids.has(p.clubId) && (key === 'rating' ? p.seasonApps >= 2 : p[key] > 0));
  const score = (p: Player) => (key === 'rating' ? p.seasonRating / p.seasonApps : p[key]);
  return list.sort((a, b) => score(b) - score(a)).slice(0, n);
}
export function teamStats(g: GameState, clubId: number) {
  const row = g.tables[g.clubs[clubId].div]?.find((r) => r.club === clubId);
  return row;
}
export const last5 = (g: GameState): ('W' | 'D' | 'L')[] =>
  userFixtures(g)
    .filter((f) => f.played)
    .slice(-5)
    .map((f) => {
      const mine = f.home === g.userClub ? f.hg : f.ag;
      const th = f.home === g.userClub ? f.ag : f.hg;
      if (mine === th && f.pens) return (f.home === g.userClub ? f.pens[0] > f.pens[1] : f.pens[1] > f.pens[0]) ? 'W' : 'L';
      return mine > th ? 'W' : mine < th ? 'L' : 'D';
    });
