// Pure match simulation: no rendering code in here.
import type { FormationId, Mentality, Player, Pos, Style } from './types';
import { tv } from './tuning';
import { fit, slotsOf, type Slot } from './formations';

export const W = 105;
export const H = 68;
export const GOAL_HALF = 3.66;
export const GOAL_H = 2.44;
/** Match length in real seconds for 90 minutes — tunable from the Tune panel. */
export const MATCH_SECONDS = () => tv('match.duration');
const HALF_SECONDS = () => MATCH_SECONDS() / 2;
const G = 18;

export type AState = 'idle' | 'walk' | 'run' | 'kick' | 'shoot' | 'tackle' | 'celebrate' | 'dive' | 'fallen';

export interface Setup {
  clubId: number;
  name: string;
  color: string;
  color2: string;
  gkColor: string;
  formation: FormationId;
  /** Own layout of the positions; the formation's standard one when left out. */
  slots?: Slot[];
  mentality: Mentality;
  style: Style;
  lineup: Player[]; // 11 by slot
  bench: Player[];
  captainId: number;
  isUser: boolean;
  pattern: number;
}

export interface AgentStats {
  passes: number;
  passOk: number;
  shots: number;
  sot: number;
  goals: number;
  assists: number;
  tackles: number;
  inter: number;
  saves: number;
  fouls: number;
  secs: number;
}

export interface Agent {
  id: number;
  side: 0 | 1;
  slot: number;
  slotPos: Pos;
  player: Player;
  hu: number;
  hv: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  state: AState;
  stateT: number;
  energy: number;
  think: number;
  cd: number; // pickup cooldown
  tackleCd: number;
  stun: number;
  maxSp: number;
  eff: { speed: number; shooting: number; passing: number; dribbling: number; defending: number };
  stats: AgentStats;
  diveY: number;
  diveDir: number;
  leaving: boolean;
  forced: null | 'pass' | 'freekick';
  celebT: number;
  phase: number; // animation phase seed
  yellow: boolean;
  red: boolean;
  injured: boolean;
}

interface ShotInfo {
  side: 0 | 1;
  outcome: 'goal' | 'save' | 'miss';
  ty: number;
  tz: number;
  T: number;
  t: number;
  shooter: Agent;
  gk: Agent;
  diveY: number;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: Agent | null;
  lastTouch: Agent | null;
  lastPasser: Agent | null;
  lastPassT: number;
  passTarget: Agent | null;
  passDest: { x: number; y: number } | null;
  shot: ShotInfo | null;
  dead: number;
  restartSide: 0 | 1;
  taker: Agent | null;
}

export interface MatchEvent {
  t: number;
  min: number;
  type: 'kickoff' | 'goal' | 'shot' | 'save' | 'miss' | 'foul' | 'offside' | 'sub' | 'ht' | 'ft' | 'corner' | 'card' | 'tackle' | 'injury' | 'talk';
  side: 0 | 1 | -1;
  text: string;
  pid?: number;
}

export interface TeamStats {
  shots: number;
  sot: number;
  passes: number;
  passOk: number;
  tackles: number;
  fouls: number;
  corners: number;
  offsides: number;
  poss: number;
  yellows: number;
  reds: number;
}

export interface PlayerMatchStat {
  pid: number;
  side: 0 | 1;
  name: string;
  pos: Pos;
  goals: number;
  assists: number;
  rating: number;
  secs: number;
  yellow: boolean;
  red: boolean;
  injured: boolean;
}

export interface MatchResult {
  score: [number, number];
  events: MatchEvent[];
  stats: [TeamStats, TeamStats];
  players: PlayerMatchStat[];
}

export type Phase = 'kickoff' | 'play' | 'goal' | 'ht' | 'ft';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const dirOf = (side: number) => (side === 0 ? 1 : -1);
const goalX = (side: number) => (side === 0 ? W : 0);

export class MatchEngine {
  agents: Agent[] = [];
  leaving: Agent[] = [];
  retired: Agent[] = [];
  ball: Ball;
  time = 0;
  phase: Phase = 'kickoff';
  phaseT = 0;
  score: [number, number] = [0, 0];
  events: MatchEvent[] = [];
  teamStats: [TeamStats, TeamStats] = [this.blank(), this.blank()];
  subsLeft: [number, number] = [3, 3];
  setups: [Setup, Setup];
  half = 1;
  firstKick: 0 | 1;
  scorerAgent: Agent | null = null;
  scorerSide: 0 | 1 = 0;
  onEvent: ((e: MatchEvent) => void) | null = null;
  possTicks: [number, number] = [0, 0];
  private nextId = 0;
  private clock = 0; // tick counter for noise
  private cpuSubbed: [boolean, boolean] = [false, false];

  constructor(home: Setup, away: Setup) {
    this.setups = [home, away];
    this.firstKick = Math.random() < 0.5 ? 0 : 1;
    this.ball = {
      x: W / 2, y: H / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: null, lastPasser: null, lastPassT: -99,
      passTarget: null, passDest: null, shot: null, dead: 0, restartSide: 0, taker: null,
    };
    for (const side of [0, 1] as const) {
      const s = this.setups[side];
      const slots = slotsOf(s);
      for (let i = 0; i < 11; i++) this.agents.push(this.makeAgent(side, i, s.lineup[i], slots[i].pos, slots[i].u, slots[i].v));
    }
    this.kickoff(this.firstKick);
  }

  private blank(): TeamStats {
    return { shots: 0, sot: 0, passes: 0, passOk: 0, tackles: 0, fouls: 0, corners: 0, offsides: 0, poss: 0, yellows: 0, reds: 0 };
  }

  private makeAgent(side: 0 | 1, slot: number, player: Player, slotPos: Pos, hu: number, hv: number): Agent {
    const c = fit(player, slotPos);
    const cap = this.setups[side].captainId === player.id ? 2 : 0;
    const f = (n: number) => clamp(n * c + cap, 5, 99);
    const eff = {
      speed: f(player.speed), shooting: f(player.shooting), passing: f(player.passing),
      dribbling: f(player.dribbling), defending: f(player.defending),
    };
    return {
      id: this.nextId++, side, slot, slotPos, player, hu, hv, x: 0, y: 0, vx: 0, vy: 0, face: side === 0 ? 1 : -1,
      state: 'idle', stateT: 0, energy: 1, think: 0.3, cd: 0, tackleCd: 0, stun: 0,
      maxSp: 4.6 + (eff.speed / 100) * 3.6, eff,
      stats: { passes: 0, passOk: 0, shots: 0, sot: 0, goals: 0, assists: 0, tackles: 0, inter: 0, saves: 0, fouls: 0, secs: 0 },
      diveY: H / 2, diveDir: 0, leaving: false, forced: null, celebT: 0, phase: Math.random() * 6, yellow: false, red: false, injured: false,
    };
  }

  // ---------- coordinates ----------
  home(a: Agent): [number, number] {
    return a.side === 0 ? [a.hu * W, a.hv * H] : [(1 - a.hu) * W, (1 - a.hv) * H];
  }
  private toWorld(side: number, u: number, v: number): [number, number] {
    return side === 0 ? [u * W, v * H] : [(1 - u) * W, (1 - v) * H];
  }
  private uOf(side: number, x: number) {
    return side === 0 ? x / W : 1 - x / W;
  }
  private vOf(side: number, y: number) {
    return side === 0 ? y / H : 1 - y / H;
  }
  get minute() {
    return Math.min(90, Math.floor((this.time / MATCH_SECONDS()) * 90));
  }
  active(side?: 0 | 1) {
    return side === undefined ? this.agents : this.agents.filter((a) => a.side === side);
  }
  gk(side: number) {
    return this.agents.find((a) => a.side === side && a.slotPos === 'GK')!;
  }
  possSide(): -1 | 0 | 1 {
    const b = this.ball;
    if (b.owner) return b.owner.side;
    if (b.dead > 0) return b.restartSide;
    if (b.passTarget) return b.passTarget.side;
    if (b.shot) return b.shot.side;
    return -1;
  }

  // ---------- events ----------
  private emit(type: MatchEvent['type'], side: 0 | 1 | -1, text: string, pid?: number) {
    const e: MatchEvent = { t: this.time, min: this.minute, type, side, text, pid };
    this.events.push(e);
    this.onEvent?.(e);
  }

  // ---------- setup positions ----------
  private kickoff(side: 0 | 1) {
    this.phase = 'kickoff';
    this.phaseT = 0;
    for (const a of this.agents) {
      const u = Math.min(a.hu, a.slotPos === 'GK' ? 0.05 : 0.47);
      const [x, y] = this.toWorld(a.side, u, a.hv);
      a.x = x; a.y = y; a.vx = 0; a.vy = 0; a.state = 'idle'; a.stateT = 0; a.stun = 0; a.forced = null; a.cd = 0;
      a.face = dirOf(a.side) as 1 | -1;
    }
    const cands = this.agents.filter((a) => a.side === side && a.slotPos !== 'GK').sort((p, q) => q.hu - p.hu);
    const kicker = cands[0];
    kicker.x = W / 2 - dirOf(side) * 0.8;
    kicker.y = H / 2;
    const b = this.ball;
    b.x = W / 2; b.y = H / 2; b.z = 0; b.vx = b.vy = b.vz = 0; b.shot = null; b.passTarget = null; b.passDest = null;
    b.dead = 0; b.owner = kicker; b.lastTouch = kicker;
    kicker.think = 0.2;
    kicker.forced = 'pass';
    this.scorerAgent = null;
  }

  /** Half-time team talk: small boosts for the second half, different per tone. */
  teamTalk(side: 0 | 1, kind: 'pep' | 'scold' | 'focus') {
    for (const a of this.agents) {
      if (a.side !== side) continue;
      if (kind === 'pep') {
        a.energy = Math.min(1, a.energy + 0.1);
        a.eff.passing = clamp(a.eff.passing + 2, 5, 99);
        a.eff.dribbling = clamp(a.eff.dribbling + 2, 5, 99);
      } else if (kind === 'scold') {
        a.eff.speed = clamp(a.eff.speed + 3, 5, 99);
        a.eff.shooting = clamp(a.eff.shooting + 3, 5, 99);
        a.energy = Math.max(0.15, a.energy - 0.06);
      } else {
        a.eff.defending = clamp(a.eff.defending + 3, 5, 99);
        a.energy = Math.min(1, a.energy + 0.05);
      }
    }
    const word = kind === 'pep' ? '📣 Pep talk' : kind === 'scold' ? '😤 Hard talk' : '🧠 Defensive focus';
    this.emit('talk', side, `${word} — second half!`);
  }

  resumeSecondHalf() {
    if (this.phase !== 'ht') return;
    // the CPU manager gives their own talk
    const aiSide: 0 | 1 = this.setups[0].isUser ? 1 : 0;
    if (!this.setups[aiSide].isUser) this.teamTalk(aiSide, (['pep', 'scold', 'focus'] as const)[Math.floor(Math.random() * 3)]);
    this.half = 2;
    this.kickoff(this.firstKick === 0 ? 1 : 0);
    this.emit('kickoff', -1, 'Second half starts!');
  }

  // ---------- substitutions ----------
  canSub(side: 0 | 1) {
    return this.subsLeft[side] > 0 && this.phase !== 'ft';
  }
  substitute(side: 0 | 1, slot: number, inP: Player): boolean {
    if (!this.canSub(side)) return false;
    const out = this.agents.find((a) => a.side === side && a.slot === slot);
    if (!out) return false;
    const setup = this.setups[side];
    this.subsLeft[side]--;
    if (this.ball.owner === out) {
      this.ball.owner = null;
      this.ball.vx = this.ball.vy = 0;
    }
    out.leaving = true;
    out.state = 'walk';
    this.agents.splice(this.agents.indexOf(out), 1);
    this.leaving.push(out);
    this.retired.push(out);
    const slots = slotsOf(setup);
    const na = this.makeAgent(side, slot, inP, slots[slot].pos, out.hu, out.hv);
    na.x = W / 2 + (side === 0 ? -6 : 6);
    na.y = -1.5;
    na.state = 'run';
    this.agents.push(na);
    setup.lineup[slot] = inP;
    setup.bench = setup.bench.filter((p) => p.id !== inP.id);
    this.emit('sub', side, `🔄 ${this.minute}' ${inP.name} replaces ${out.player.name}`, inP.id);
    return true;
  }

  // ---------- cards & injuries ----------
  /** Take a player off the pitch with nobody coming on (sent off, or hurt with no subs left). */
  private removeAgent(a: Agent) {
    const b = this.ball;
    if (b.owner === a) {
      b.owner = null;
      b.vx = b.vy = 0;
    }
    if (b.passTarget === a) b.passTarget = null;
    a.leaving = true;
    a.state = 'walk';
    const i = this.agents.indexOf(a);
    if (i >= 0) this.agents.splice(i, 1);
    this.leaving.push(a);
    this.retired.push(a);
  }

  private afterFoul(fouler: Agent, victim: Agent) {
    const name = fouler.player.name;
    // keepers and very short-handed teams are never sent off, so a match always stays playable
    const canGo = fouler.slotPos !== 'GK' && this.agents.filter((a) => a.side === fouler.side).length > 8;
    const roll = Math.random();
    if (canGo && roll < 0.02 * tv('match.redCard')) {
      fouler.red = true;
      this.teamStats[fouler.side].reds++;
      this.emit('card', fouler.side, `🟥 ${this.minute}' Red card! ${name} is sent off`, fouler.player.id);
      this.removeAgent(fouler);
    } else if (roll < 0.24 * tv('match.yellowCard')) {
      if (!fouler.yellow) {
        fouler.yellow = true;
        this.teamStats[fouler.side].yellows++;
        this.emit('card', fouler.side, `🟨 ${this.minute}' Yellow card for ${name}`, fouler.player.id);
      } else if (canGo) {
        fouler.red = true;
        this.teamStats[fouler.side].yellows++;
        this.teamStats[fouler.side].reds++;
        this.emit('card', fouler.side, `🟥 ${this.minute}' Second yellow! ${name} is sent off`, fouler.player.id);
        this.removeAgent(fouler);
      }
    }
    if (victim.slotPos !== 'GK' && Math.random() < 0.05 * tv('match.injuryRisk')) this.injure(victim);
  }

  /** A hurt player comes off: a substitute replaces them if one is available, otherwise the team plays a player short. */
  private injure(a: Agent) {
    a.injured = true;
    this.emit('injury', a.side, `🚑 ${this.minute}' ${a.player.name} is injured`, a.player.id);
    const s = this.setups[a.side];
    const rep = s.bench.filter((p) => p.pos !== 'GK').sort((p, q) => fit(q, a.slotPos) * q.ovr - fit(p, a.slotPos) * p.ovr)[0];
    if (rep && this.canSub(a.side)) this.substitute(a.side, a.slot, rep);
    else if (this.agents.filter((x) => x.side === a.side).length > 8) this.removeAgent(a);
  }

  // ---------- main step ----------
  step(dt: number) {
    if (this.phase === 'ft' || this.phase === 'ht') return;
    this.clock += dt;
    this.phaseT += dt;

    if (this.phase === 'kickoff') {
      this.moveAgents(dt, true);
      if (this.phaseT > 0.9) this.phase = 'play';
      return;
    }
    if (this.phase === 'goal') {
      this.moveAgents(dt, false);
      if (this.phaseT > 4.2) {
        const conceding = (this.scorerSide === 0 ? 1 : 0) as 0 | 1;
        this.kickoff(conceding);
      }
      return;
    }

    this.time += dt;
    const ps = this.possSide();
    if (ps !== -1) this.possTicks[ps]++;
    for (const a of this.agents) {
      a.stats.secs += dt;
      a.cd = Math.max(0, a.cd - dt);
      a.tackleCd = Math.max(0, a.tackleCd - dt);
      a.stun = Math.max(0, a.stun - dt);
    }
    this.moveAgents(dt, false);
    this.updateOwner(dt);
    this.updateBall(dt);
    this.pickupAndTackle();
    this.cpuSubs();

    if (this.half === 1 && this.time >= HALF_SECONDS()) {
      this.phase = 'ht';
      this.emit('ht', -1, `⏸️ Half time ${this.score[0]} - ${this.score[1]}`);
    } else if (this.time >= MATCH_SECONDS() && !this.ball.shot) {
      this.phase = 'ft';
      this.time = MATCH_SECONDS();
      this.emit('ft', -1, `🏁 Full time ${this.score[0]} - ${this.score[1]}`);
    }
  }

  private cpuSubs() {
    if (this.time < 118) return;
    for (const side of [0, 1] as const) {
      const s = this.setups[side];
      if (s.isUser || this.cpuSubbed[side] || !this.canSub(side) || s.bench.length === 0) continue;
      this.cpuSubbed[side] = true;
      const field = this.agents.filter((a) => a.side === side && a.slotPos !== 'GK').sort((p, q) => p.energy - q.energy);
      const out = field[0];
      if (!out) continue;
      const rep = s.bench.filter((p) => p.pos !== 'GK').sort((p, q) => fit(q, out.slotPos) * q.ovr - fit(p, out.slotPos) * p.ovr)[0];
      if (rep) this.substitute(side, out.slot, rep);
    }
  }

  // ---------- AI movement ----------
  private moveAgents(dt: number, calm: boolean) {
    const b = this.ball;
    const ps = this.possSide();
    const goalPhase = this.phase === 'goal';
    const owner = b.owner;

    // chasers
    const chasers = new Set<Agent>();
    if (!goalPhase && !calm && b.dead <= 0 && !b.shot) {
      for (const side of [0, 1] as const) {
        if (ps === side && owner) continue;
        const tx = b.passDest ? b.passDest.x : b.x;
        const ty = b.passDest ? b.passDest.y : b.y;
        if (b.passTarget && b.passTarget.side === side) { chasers.add(b.passTarget); continue; }
        const mates = this.agents
          .filter((a) => a.side === side && a.stun <= 0 && a.state !== 'fallen')
          .map((a) => ({ a, d: dist(a.x, a.y, tx, ty) }))
          .filter((o) => o.a.slotPos !== 'GK' || this.inOwnBox(o.a.side, tx, ty))
          .sort((p, q) => p.d - q.d);
        const own = side === 0 ? b.x : W - b.x;
        const k = ps === -1 ? 1 : own < 38 ? 2 : 1;
        for (let i = 0; i < Math.min(k, mates.length); i++) chasers.add(mates[i].a);
      }
    }

    for (const a of this.agents) this.driveAgent(a, dt, chasers, ps, calm, goalPhase, owner);
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const a = this.leaving[i];
      const ty = a.y > H / 2 ? H + 1.5 : -1.5;
      this.steer(a, W / 2 + (a.side === 0 ? -6 : 6), ty, 4.5, dt);
      a.state = 'walk';
      if (Math.abs(a.y - ty) < 0.6 || this.phase === 'ft') {
        this.leaving.splice(i, 1);
      }
    }
  }

  private inOwnBox(side: number, x: number, y: number) {
    const dx = side === 0 ? x : W - x;
    return dx < 17 && Math.abs(y - H / 2) < 21;
  }

  private steer(a: Agent, tx: number, ty: number, maxSp: number, dt: number) {
    const dx = tx - a.x;
    const dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    const sp = Math.min(maxSp, d * 2.6);
    const wx = d > 0.001 ? (dx / d) * sp : 0;
    const wy = d > 0.001 ? (dy / d) * sp : 0;
    const acc = 17 * dt;
    const ax = wx - a.vx;
    const ay = wy - a.vy;
    const al = Math.hypot(ax, ay);
    if (al > acc) {
      a.vx += (ax / al) * acc;
      a.vy += (ay / al) * acc;
    } else {
      a.vx = wx;
      a.vy = wy;
    }
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.x = clamp(a.x, -3, W + 3);
    a.y = clamp(a.y, -3, H + 3);
  }

  private driveAgent(a: Agent, dt: number, chasers: Set<Agent>, ps: number, calm: boolean, goalPhase: boolean, owner: Agent | null) {
    const b = this.ball;
    const setup = this.setups[a.side];
    const ment = setup.mentality;
    a.stateT = Math.max(0, a.stateT - dt);
    const override = a.stateT > 0 && (a.state === 'kick' || a.state === 'shoot' || a.state === 'tackle' || a.state === 'fallen' || a.state === 'dive' || a.state === 'celebrate');

    // energy drain
    const sp = Math.hypot(a.vx, a.vy);
    a.energy = Math.max(0.15, a.energy - 0.0053 * (sp / 7) * (1.25 - (a.player.stamina / 100) * 0.75) * dt * 1.8);
    const maxSp = a.maxSp * tv('match.playerSpeed') * (0.72 + 0.28 * a.energy) * (owner === a ? 0.9 : 1);

    if (goalPhase) {
      this.driveCelebration(a, dt);
      return;
    }
    if (override) {
      if (a.state === 'dive') {
        a.vx *= 0.9;
        a.y += a.vy * dt;
        a.x += a.vx * dt;
        if (a.stateT < 0.25) a.vy *= 0.8;
      } else if (a.state === 'tackle') {
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        a.vx *= 0.93; a.vy *= 0.93;
      } else if (a.state === 'fallen') {
        a.vx *= 0.8; a.vy *= 0.8;
        a.x += a.vx * dt; a.y += a.vy * dt;
      } else {
        a.vx *= 0.9; a.vy *= 0.9;
        a.x += a.vx * dt; a.y += a.vy * dt;
      }
      return;
    }

    const isGK = a.slotPos === 'GK';
    let tx: number;
    let ty: number;
    let factor = 1;

    if (b.dead > 0 && b.taker === a) {
      tx = b.x; ty = b.y; factor = 0.7;
    } else if (owner === a) {
      [tx, ty] = this.dribbleTarget(a);
      factor = isGK ? 0.5 : 0.9;
    } else if (a === b.shot?.gk) {
      const sh = b.shot!;
      tx = a.side === 0 ? 1.2 : W - 1.2;
      ty = sh.diveY;
      factor = 1.3;
      const left = sh.T - sh.t;
      if (left < 0.5 && a.state !== 'dive' && Math.abs(a.y - sh.diveY) > 0.7) {
        a.state = 'dive';
        a.stateT = 0.8;
        a.diveY = sh.diveY;
        a.diveDir = Math.sign(sh.diveY - a.y) || 1;
        a.vx = 0;
        a.vy = clamp((sh.diveY - a.y) / Math.max(0.2, left), -11, 11);
        return;
      }
    } else if (chasers.has(a)) {
      if (b.passDest && b.passTarget) {
        tx = b.passDest.x; ty = b.passDest.y;
      } else if (owner) {
        tx = owner.x + owner.vx * 0.25; ty = owner.y + owner.vy * 0.25;
      } else {
        tx = b.x + b.vx * 0.3; ty = b.y + b.vy * 0.3;
      }
      factor = 1.05;
    } else {
      [tx, ty] = this.positionTarget(a, ps, ment, owner);
      const bd = dist(a.x, a.y, b.x, b.y);
      factor = calm ? 0.45 : bd > 38 ? 0.5 : bd > 20 ? 0.72 : 0.9;
      if (b.dead > 0 && b.taker !== a) factor = Math.min(factor, 0.7);
    }
    if (a.stun > 0) factor *= 0.35;
    this.steer(a, tx, ty, maxSp * factor, dt);

    // anim state
    const s2 = Math.hypot(a.vx, a.vy);
    if (Math.abs(a.vx) > 0.4) a.face = a.vx > 0 ? 1 : -1;
    else if (s2 < 0.5) a.face = b.x > a.x ? 1 : -1;
    a.state = s2 < 0.5 ? 'idle' : s2 < 3.3 ? 'walk' : 'run';
    if (owner === a && s2 >= 0.5 && s2 < 3.3 && factor > 0.8) a.state = 'run';
  }

  private driveCelebration(a: Agent, dt: number) {
    const sc = this.scorerAgent;
    const maxSp = a.maxSp;
    if (!sc) {
      a.state = 'idle';
      return;
    }
    if (a === sc) {
      if (a.celebT < 1.3) {
        const tx = clamp(a.x + dirOf(a.side) * 6, 6, W - 6);
        const ty = a.y < H / 2 ? 3 : H - 3;
        this.steer(a, tx, ty, maxSp * 0.9, dt);
        a.state = 'run';
        if (Math.abs(a.vx) > 0.4) a.face = a.vx > 0 ? 1 : -1;
      } else {
        a.vx *= 0.9; a.vy *= 0.9;
        a.state = 'celebrate';
      }
      a.celebT += dt;
    } else if (a.side === sc.side && a.slotPos !== 'GK') {
      const ang = a.id * 1.7;
      const tx = sc.x + Math.cos(ang) * 2.2;
      const ty = sc.y + Math.sin(ang) * 2.2;
      const d = dist(a.x, a.y, tx, ty);
      if (d > 1.2 && a.celebT < 99) {
        this.steer(a, tx, ty, maxSp * 1.0, dt);
        a.state = 'run';
        if (Math.abs(a.vx) > 0.4) a.face = a.vx > 0 ? 1 : -1;
      } else {
        a.vx *= 0.8; a.vy *= 0.8;
        a.state = 'celebrate';
        a.face = sc.x > a.x ? 1 : -1;
      }
    } else {
      const [hx, hy] = this.home(a);
      this.steer(a, hx, hy, maxSp * 0.35, dt);
      a.state = Math.hypot(a.vx, a.vy) > 0.5 ? 'walk' : 'idle';
    }
  }

  private dribbleTarget(a: Agent): [number, number] {
    const gx = goalX(a.side);
    let ty = H / 2 + (a.y - H / 2) * 0.55;
    const dir = dirOf(a.side);
    for (const o of this.agents) {
      if (o.side === a.side) continue;
      const ahead = (o.x - a.x) * dir;
      if (ahead > 0 && ahead < 9 && Math.abs(o.y - a.y) < 3.5) {
        ty = a.y + (o.y >= a.y ? -1 : 1) * 7;
        break;
      }
    }
    if (a.slotPos === 'GK') return [a.x, a.y];
    return [gx, clamp(ty, 4, H - 4)];
  }

  private positionTarget(a: Agent, ps: number, ment: number, owner: Agent | null): [number, number] {
    const b = this.ball;
    const isGK = a.slotPos === 'GK';
    const ballU = this.uOf(a.side, b.x);
    const ballV = this.vOf(a.side, b.y);
    let u = a.hu;
    let v = a.hv;
    const lineShift = (ballU - 0.5) * (isGK ? 0.1 : 0.55) + (ment - 1) * 0.05;
    u += lineShift * (a.hu < 0.3 ? 0.75 : 1);
    if (ps === a.side) u += a.hu > 0.55 ? 0.08 : a.hu > 0.35 ? 0.04 : 0;
    else if (ps !== -1) u -= a.hu > 0.55 ? 0.07 : 0;
    v += (ballV - v) * (isGK ? 0.3 : ps === a.side ? 0.1 : 0.22);
    if (ps === a.side && owner && owner !== a && !isGK && a.hu > 0.3) {
      const ou = this.uOf(a.side, owner.x);
      const ahead = clamp(ou + 0.13 + (a.hu - 0.5) * 0.12, 0.1, 0.96);
      u = u * 0.6 + ahead * 0.4;
    }
    // restart set pieces: attackers crowd the box on corners
    if (b.dead > 0 && ps === a.side && !isGK && ballU > 0.9 && a.hu > 0.4) {
      u = 0.9;
      v = 0.3 + ((a.id * 0.37) % 0.4);
    }
    u += Math.sin(this.time * 0.7 + a.id) * 0.012;
    v += Math.cos(this.time * 0.6 + a.id * 1.3) * 0.02;
    u = clamp(u, isGK ? 0.02 : 0.05, isGK ? 0.1 : 0.95);
    v = clamp(v, 0.04, 0.96);
    return this.toWorld(a.side, u, v);
  }

  // ---------- owner decisions ----------
  private updateOwner(dt: number) {
    const b = this.ball;
    if (b.dead > 0) {
      b.dead -= dt;
      if (b.dead <= 0 && b.taker) {
        const t = b.taker;
        b.dead = 0;
        b.owner = t;
        b.lastTouch = t;
        t.think = 0.05;
        t.forced = t.forced ?? 'pass';
        b.taker = null;
      }
      return;
    }
    const a = b.owner;
    if (!a) return;
    if (a.state === 'fallen' || a.stun > 0) return;
    a.think -= dt;
    if (a.think > 0) return;
    a.think = 0.28 + Math.random() * 0.45;

    const setup = this.setups[a.side];
    const gx = goalX(a.side);
    const d = dist(a.x, a.y, gx, H / 2);
    let pressure = 99;
    for (const o of this.agents) if (o.side !== a.side) pressure = Math.min(pressure, dist(a.x, a.y, o.x, o.y));
    const forced = a.forced;
    a.forced = null;

    if (forced === 'freekick' && d < 30) {
      this.shoot(a, pressure);
      return;
    }
    if (a.slotPos === 'GK') {
      const opt = this.bestPass(a, setup, true);
      if (opt) this.pass(a, opt, setup);
      return;
    }
    let shootP = 0;
    if (d < 42) shootP = (0.16 + ((42 - d) / 42) * 0.6 + (setup.mentality - 1) * 0.08 + (a.eff.shooting - 60) / 300) * tv('match.shootChance');
    if (pressure < 2) shootP += 0.05;
    if (!forced && Math.random() < shootP) {
      this.shoot(a, pressure);
      return;
    }
    const opt = this.bestPass(a, setup, false);
    let wantPass = pressure < 4 ? 0.8 : 0.28 + (setup.style === 'short' ? 0.12 : 0) + (setup.mentality === 0 ? 0.08 : 0);
    if (forced) wantPass = 1;
    if (opt && Math.random() < wantPass) this.pass(a, opt, setup);
  }

  private isOffside(t: Agent, passer: Agent): boolean {
    const s = t.side;
    const p = (x: number) => (s === 0 ? x : W - x);
    if (p(t.x) <= W / 2) return false;
    if (p(t.x) <= p(this.ball.x) + 0.3) return false;
    const opp = this.agents.filter((o) => o.side !== s).map((o) => p(o.x)).sort((x, y) => y - x);
    const second = opp[1] ?? opp[0];
    return p(t.x) > second + 0.4;
  }

  private bestPass(a: Agent, setup: Setup, fromGK: boolean): Agent | null {
    const dir = dirOf(a.side);
    let best: Agent | null = null;
    let bestScore = -999;
    const opps = this.agents.filter((o) => o.side !== a.side);
    for (const t of this.agents) {
      if (t.side !== a.side || t === a) continue;
      const d = dist(a.x, a.y, t.x, t.y);
      const maxD = setup.style === 'long' ? 62 : fromGK ? 55 : 42;
      if (d < 4 || d > maxD) continue;
      if (t.slotPos === 'GK' && !(this.uOf(a.side, a.x) < 0.2)) continue;
      if (this.isOffside(t, a) && Math.random() < 0.88) continue;
      let minOpp = 99;
      let risk = 0;
      let blocked = false;
      for (const o of opps) {
        minOpp = Math.min(minOpp, dist(o.x, o.y, t.x, t.y));
        // distance from o to segment a->t
        const vx = t.x - a.x;
        const vy = t.y - a.y;
        const l2 = vx * vx + vy * vy;
        const k = clamp(((o.x - a.x) * vx + (o.y - a.y) * vy) / l2, 0, 1);
        const dd = dist(o.x, o.y, a.x + vx * k, a.y + vy * k);
        if (dd < 1.3 && d < 28) blocked = true;
        if (dd < 2.6) risk += 2.6 - dd;
      }
      if (blocked && Math.random() < 0.85) continue;
      const fwd = (t.x - a.x) * dir;
      const wFwd = setup.style === 'short' ? 0.08 : setup.style === 'counter' ? 0.2 : 0.13;
      const wDist = setup.style === 'long' ? 0.015 : 0.06;
      const score = Math.min(10, minOpp) * 0.8 + fwd * wFwd - d * wDist - risk * 2.5 + this.uOf(a.side, t.x) * 4 + Math.random() * 2.2;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  private release(a: Agent) {
    const b = this.ball;
    b.owner = null;
    b.lastTouch = a;
    a.cd = 0.4;
    b.dead = 0;
  }

  private pass(a: Agent, t: Agent, setup: Setup) {
    const b = this.ball;
    if (this.isOffside(t, a)) {
      this.teamStats[a.side === 0 ? 1 : 0].offsides++;
      this.emit('offside', a.side, `🚩 ${this.minute}' Offside! ${t.player.name}`, t.player.id);
      this.restart('offside', (a.side === 0 ? 1 : 0), clamp(t.x, 2, W - 2), clamp(t.y, 1, H - 1));
      return;
    }
    const d0 = dist(a.x, a.y, t.x, t.y);
    const speed = clamp(8 + d0 * 0.9, 11, 24);
    const T0 = d0 / speed;
    let dx = t.x + t.vx * T0 * 0.8;
    let dy = t.y + t.vy * T0 * 0.8;
    const sigma = (1 - a.eff.passing / 112) * 1.9 * (1 + d0 / 35) * (a.energy < 0.5 ? 1.25 : 1);
    dx += gauss() * sigma;
    dy += gauss() * sigma;
    dx = clamp(dx, 0.5, W - 0.5);
    dy = clamp(dy, 0.5, H - 0.5);
    const d = dist(a.x, a.y, dx, dy);
    const lofted = d > 26 || (setup.style === 'long' && d > 18);
    const T = lofted ? clamp(d / 19, 0.9, 2.3) : d / speed;
    b.vx = (dx - b.x) / T;
    b.vy = (dy - b.y) / T;
    b.vz = lofted ? (G * T) / 2 : 0;
    b.z = 0.2;
    this.release(a);
    b.passTarget = t;
    b.passDest = { x: dx, y: dy };
    b.lastPasser = a;
    b.lastPassT = this.time;
    a.stats.passes++;
    this.teamStats[a.side].passes++;
    a.state = 'kick';
    a.stateT = 0.28;
    if (Math.abs(dx - a.x) > 0.5) a.face = dx > a.x ? 1 : -1;
    a.vx *= 0.5; a.vy *= 0.5;
  }

  private shoot(a: Agent, pressure: number) {
    const b = this.ball;
    const gx = goalX(a.side);
    const d = dist(a.x, a.y, gx, H / 2);
    const gk = this.gk(a.side === 0 ? 1 : 0);
    const aimY = H / 2 + (Math.random() * 2 - 1) * 3.0;
    const aimZ = 0.35 + Math.random() * 1.7;
    const sigma = clamp((1.35 - (a.eff.shooting / 100) * 0.85) * (0.75 + d / 20) * (pressure < 2.5 ? 1.3 : 1) * (a.energy < 0.5 ? 1.2 : 1), 0.4, 6);
    const ty = aimY + gauss() * sigma;
    let tz = aimZ + gauss() * sigma * 0.45;
    if (tz < 0.1 && tz > -1) tz = 0.1;
    const onTarget = Math.abs(ty - H / 2) < GOAL_HALF && tz > 0 && tz < GOAL_H;
    let outcome: ShotInfo['outcome'] = 'miss';
    if (onTarget) {
      const cornerBonus = (Math.abs(ty - H / 2) / GOAL_HALF) * 0.12 + (tz > 1.6 || tz < 0.4 ? 0.05 : 0);
      const pSave = clamp(tv('match.keeperSkill') + (gk.eff.defending - a.eff.shooting) / 230 + (d > 20 ? 0.12 : 0) - cornerBonus, 0.12, 0.8);
      outcome = Math.random() < pSave ? 'save' : 'goal';
    }
    const speed = clamp(20 + a.eff.shooting * 0.14, 22, 34);
    const d2 = dist(a.x, a.y, gx, ty);
    const T = d2 / speed;
    const z0 = 0.3;
    b.x = a.x + dirOf(a.side) * 0.6;
    b.y = a.y;
    b.vx = ((gx - b.x) / T);
    b.vy = (ty - b.y) / T;
    b.z = z0;
    b.vz = (tz - z0 + 0.5 * G * T * T) / T;
    this.release(a);
    b.passTarget = null;
    b.passDest = null;
    let diveY = ty;
    if (outcome === 'goal') diveY = ty + (ty > H / 2 ? -1 : 1) * (1.8 + Math.random() * 1.5);
    if (outcome === 'miss') diveY = clamp(ty, H / 2 - 3, H / 2 + 3);
    b.shot = { side: a.side, outcome, ty, tz, T, t: 0, shooter: a, gk, diveY: clamp(diveY, H / 2 - 4.5, H / 2 + 4.5) };
    a.state = 'shoot';
    a.stateT = 0.4;
    a.face = dirOf(a.side) as 1 | -1;
    a.vx *= 0.4; a.vy *= 0.4;
    a.stats.shots++;
    this.teamStats[a.side].shots++;
    if (onTarget) {
      a.stats.sot++;
      this.teamStats[a.side].sot++;
    }
    this.emit('shot', a.side, `${onTarget ? '🎯' : '💨'} ${this.minute}' ${a.player.name} shoots!`, a.player.id);
  }

  // ---------- restarts ----------
  private restart(kind: 'throw' | 'corner' | 'goalkick' | 'freekick' | 'offside', side: 0 | 1, x: number, y: number) {
    const b = this.ball;
    b.owner = null;
    b.shot = null;
    b.passTarget = null;
    b.passDest = null;
    b.vx = b.vy = b.vz = 0;
    b.z = 0;
    b.x = x;
    b.y = y;
    b.dead = kind === 'corner' ? 1.2 : 0.9;
    b.restartSide = side;
    let taker: Agent;
    if (kind === 'goalkick') taker = this.gk(side);
    else {
      taker = this.agents
        .filter((a) => a.side === side && a.slotPos !== 'GK' && a.state !== 'fallen')
        .sort((p, q) => dist(p.x, p.y, x, y) - dist(q.x, q.y, x, y))[0] ?? this.gk(side);
    }
    taker.x = clamp(x - (x > W / 2 ? -1 : 1) * 0.0 + (kind === 'corner' ? (x < W / 2 ? -0.2 : 0.2) : 0), -1, W + 1);
    taker.y = clamp(y + (y < 1 ? -0.8 : y > H - 1 ? 0.8 : 0), -1.5, H + 1.5);
    taker.vx = taker.vy = 0;
    taker.state = 'idle';
    taker.stateT = 0;
    taker.forced = kind === 'freekick' || kind === 'offside' ? 'freekick' : 'pass';
    b.taker = taker;
    if (kind === 'corner') {
      this.teamStats[side].corners++;
      this.emit('corner', side, `🚩 ${this.minute}' Corner kick`);
    }
  }

  // ---------- ball ----------
  private updateBall(dt: number) {
    const b = this.ball;
    if (b.dead > 0 && !b.owner) return;
    if (b.owner) {
      const o = b.owner;
      const sp = Math.hypot(o.vx, o.vy);
      let hx = sp > 0.5 ? o.vx / sp : o.face;
      let hy = sp > 0.5 ? o.vy / sp : 0;
      const bounce = 0.85 + 0.4 * Math.sin(this.clock * 11 + o.phase);
      b.x = o.x + hx * bounce * 0.9;
      b.y = o.y + hy * bounce * 0.9;
      b.z = Math.max(0, 0.1 * Math.abs(Math.sin(this.clock * 11 + o.phase)));
      b.vx = b.vy = b.vz = 0;
      return;
    }
    const prevX = b.x;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.vz -= G * dt;
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -3) b.vz = -b.vz * 0.45;
      else b.vz = 0;
    }
    if (b.z === 0) {
      const f = Math.exp(-0.85 * dt);
      b.vx *= f;
      b.vy *= f;
    }
    if (b.shot) {
      b.shot.t += dt;
      const sh = b.shot;
      const gx = goalX(sh.side);
      const crossed = sh.side === 0 ? b.x >= gx - 0.4 : b.x <= gx + 0.4;
      if (crossed) {
        this.resolveShot(sh);
        return;
      }
      if (sh.t > sh.T + 1.5) b.shot = null;
    }
    // generic goal / out of play
    if (b.y < 0 || b.y > H) {
      const side = (b.lastTouch ? (b.lastTouch.side === 0 ? 1 : 0) : 0) as 0 | 1;
      this.restart('throw', side, clamp(b.x, 1, W - 1), b.y < 0 ? 0.3 : H - 0.3);
      return;
    }
    if (b.x < 0 || b.x > W) {
      const endSide = (b.x < 0 ? 0 : 1) as 0 | 1; // defender side of that end
      if (Math.abs(b.y - H / 2) < GOAL_HALF && b.z < GOAL_H && !b.shot) {
        this.goal((endSide === 0 ? 1 : 0) as 0 | 1);
        return;
      }
      const last = b.lastTouch?.side ?? endSide;
      if (last === endSide) {
        const att = (endSide === 0 ? 1 : 0) as 0 | 1;
        this.restart('corner', att, b.x < 0 ? 0.3 : W - 0.3, b.y < H / 2 ? 0.5 : H - 0.5);
      } else {
        this.restart('goalkick', endSide, b.x < 0 ? 5.5 : W - 5.5, H / 2);
      }
    }
    void prevX;
  }

  private resolveShot(sh: ShotInfo) {
    const b = this.ball;
    const gx = goalX(sh.side);
    if (sh.outcome === 'goal') {
      b.shot = null;
      this.goal(sh.side);
    } else if (sh.outcome === 'save') {
      b.shot = null;
      const gk = sh.gk;
      gk.stats.saves++;
      gk.x = gx === 0 ? 1.2 : W - 1.2;
      gk.y = sh.ty;
      b.x = gx === 0 ? 1.3 : W - 1.3;
      b.y = sh.ty;
      b.z = Math.min(1.5, sh.tz);
      this.emit('save', gk.side, `🧤 ${this.minute}' Great save by ${gk.player.name}!`, gk.player.id);
      if (Math.random() < 0.5) {
        b.owner = gk;
        b.lastTouch = gk;
        gk.think = 1.1;
        gk.state = 'idle';
        b.vx = b.vy = b.vz = 0;
      } else {
        const out = sh.ty > H / 2 ? 1 : -1;
        b.vx = (gx === 0 ? 1 : -1) * (5 + Math.random() * 3);
        b.vy = out * (5 + Math.random() * 4);
        b.vz = 3;
        b.lastTouch = gk;
        b.passTarget = null;
        gk.cd = 0.6;
      }
    } else {
      // miss: continue; leaves pitch handled by generic logic
      b.shot = null;
      this.emit('miss', sh.side, `😬 ${this.minute}' ${sh.shooter.player.name} misses the target`);
    }
  }

  private goal(side: 0 | 1) {
    const b = this.ball;
    this.score[side]++;
    this.scorerSide = side;
    this.phase = 'goal';
    this.phaseT = 0;
    let sc = b.lastTouch && b.lastTouch.side === side ? b.lastTouch : null;
    let own = false;
    if (!sc) {
      if (b.lastTouch) own = true;
      sc = this.agents.filter((a) => a.side === side && a.slotPos !== 'GK').sort((p, q) => q.hu - p.hu)[0];
    }
    this.scorerAgent = sc;
    for (const a of this.agents) a.celebT = 0;
    let assist: Agent | null = null;
    if (!own) {
      sc.stats.goals++;
      if (b.lastPasser && b.lastPasser.side === side && b.lastPasser !== sc && this.time - b.lastPassT < 6) {
        assist = b.lastPasser;
        assist.stats.assists++;
      }
    }
    b.owner = null;
    b.shot = null;
    b.passTarget = null;
    b.passDest = null;
    // ball settles in the net
    b.x = side === 0 ? W + 0.8 : -0.8;
    b.vx = (side === 0 ? 1 : -1) * 1.2;
    b.vy = 0;
    b.vz = 0;
    b.z = 0.4;
    this.emit(
      'goal',
      side,
      `⚽ ${this.minute}' GOAL! ${sc.player.name}${own ? ' (own goal)' : ''}${assist ? ` · assist ${assist.player.name}` : ''}`,
      sc.player.id,
    );
  }

  // ---------- ball contest ----------
  private pickupAndTackle() {
    const b = this.ball;
    if (this.phase !== 'play') return;
    if (b.dead > 0) return;

    if (b.owner) {
      const o = b.owner;
      for (const d of this.agents) {
        if (d.side === o.side || d.tackleCd > 0 || d.stun > 0) continue;
        if (d.state === 'tackle' || d.state === 'fallen' || d.slotPos === 'GK' && !this.inOwnBox(d.side, o.x, o.y)) continue;
        if (dist(d.x, d.y, o.x, o.y) > 1.7) continue;
        d.tackleCd = 0.9 + Math.random() * 0.6;
        const p = clamp(0.38 + (d.eff.defending - o.eff.dribbling) / 160, 0.12, 0.72);
        const dx = o.x - d.x;
        const dy = o.y - d.y;
        const l = Math.hypot(dx, dy) || 1;
        d.state = 'tackle';
        d.stateT = 0.45;
        d.vx = (dx / l) * 5;
        d.vy = (dy / l) * 5;
        if (Math.abs(dx) > 0.2) d.face = dx > 0 ? 1 : -1;
        if (Math.random() < p) {
          d.stats.tackles++;
          this.teamStats[d.side].tackles++;
          o.state = 'fallen';
          o.stateT = 0.55;
          o.vx *= 0.3; o.vy *= 0.3;
          o.cd = 0.8;
          if (Math.random() < 0.55) {
            b.owner = d;
            b.lastTouch = d;
            d.think = 0.4;
            d.stateT = 0.2;
          } else {
            b.owner = null;
            b.lastTouch = d;
            b.passTarget = null;
            b.vx = (dx / l) * 5 + (Math.random() - 0.5) * 3;
            b.vy = (dy / l) * 5 + (Math.random() - 0.5) * 3;
            b.vz = 1.5;
            d.cd = 0.25;
          }
          if (Math.random() < 0.18) this.emit('tackle', d.side, `💪 ${this.minute}' ${d.player.name} wins the ball`, d.player.id);
        } else {
          d.stun = 0.7;
          if (Math.random() < 0.14) {
            d.stats.fouls++;
            this.teamStats[d.side].fouls++;
            this.emit('foul', d.side, `❗ ${this.minute}' Foul by ${d.player.name}`, d.player.id);
            this.afterFoul(d, o);
            this.restart('freekick', o.side, clamp(o.x, 1, W - 1), clamp(o.y, 1, H - 1));
            return;
          }
        }
        return;
      }
      return;
    }

    if (b.shot) return;
    // loose / passing ball
    let best: Agent | null = null;
    let bd = 99;
    for (const a of this.agents) {
      if (a.cd > 0 || a.state === 'fallen') continue;
      if (a.state === 'dive' && a.slotPos !== 'GK') continue;
      const isGK = a.slotPos === 'GK';
      const reachZ = isGK ? 2.4 : 1.6;
      if (b.z > reachZ) continue;
      const reach = isGK && this.inOwnBox(a.side, b.x, b.y) ? 2.0 : 1.25;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < reach && d < bd) {
        bd = d;
        best = a;
      }
    }
    if (!best) return;
    const a = best;
    const pt = b.passTarget;
    const passer = b.lastPasser;
    if (pt) {
      if (a.side === (passer?.side ?? pt.side)) {
        // teammate receives
        a.cd = 0;
        this.takeBall(a);
        if (passer) {
          passer.stats.passOk++;
          this.teamStats[passer.side].passOk++;
        }
      } else {
        const p = 0.45 + a.eff.defending / 300;
        if (Math.random() < p) {
          a.stats.inter++;
          this.takeBall(a);
        } else a.cd = 0.5;
      }
    } else {
      if (Math.random() < 0.8) this.takeBall(a);
      else a.cd = 0.3;
    }
  }

  private takeBall(a: Agent) {
    const b = this.ball;
    b.owner = a;
    b.lastTouch = a;
    b.passTarget = null;
    b.passDest = null;
    b.vx = b.vy = b.vz = 0;
    a.think = 0.2 + Math.random() * 0.3;
    a.forced = null;
  }

  // ---------- results ----------
  private ratingLuck = new Map<number, number>();

  finalPlayers(): PlayerMatchStat[] {
    const all = [...this.agents, ...this.retired];
    const out: PlayerMatchStat[] = [];
    for (const a of all) {
      const st = a.stats;
      const own = this.score[a.side];
      const opp = this.score[a.side === 0 ? 1 : 0];
      let r = 6 + st.goals * 1.1 + st.assists * 0.7 + st.tackles * 0.15 + st.inter * 0.15 + st.sot * 0.1 + st.saves * 0.3 - st.fouls * 0.2;
      if (st.passes > 3) r += (st.passOk / st.passes - 0.7) * 1.5;
      if (opp === 0 && (a.slotPos === 'GK' || a.slotPos === 'CB' || a.slotPos === 'LB' || a.slotPos === 'RB')) r += 0.6;
      r += own > opp ? 0.3 : own < opp ? -0.3 : 0;
      // each player's bit of luck is rolled once, so the rating is the same every time it is read
      let luck = this.ratingLuck.get(a.player.id);
      if (luck === undefined) this.ratingLuck.set(a.player.id, (luck = (Math.random() - 0.5) * 0.6));
      r += luck;
      if (st.secs < 20 && !a.yellow && !a.red && !a.injured) continue;
      out.push({
        pid: a.player.id, side: a.side, name: a.player.name, pos: a.slotPos,
        goals: st.goals, assists: st.assists, rating: Math.round(clamp(r, 4, 10) * 10) / 10, secs: st.secs,
        yellow: a.yellow, red: a.red, injured: a.injured,
      });
    }
    return out;
  }

  result(): MatchResult {
    const total = this.possTicks[0] + this.possTicks[1] || 1;
    const stats: [TeamStats, TeamStats] = [{ ...this.teamStats[0] }, { ...this.teamStats[1] }];
    stats[0].poss = Math.round((this.possTicks[0] / total) * 100);
    stats[1].poss = 100 - stats[0].poss;
    return { score: [...this.score] as [number, number], events: this.events, stats, players: this.finalPlayers() };
  }

  /** Run the rest of the match instantly. */
  runToEnd(dt = 1 / 15) {
    let guard = 0;
    while (this.phase !== 'ft' && guard++ < 200000) {
      if (this.phase === 'ht') this.resumeSecondHalf();
      this.step(dt);
    }
  }
}

export function simulate(home: Setup, away: Setup): MatchResult {
  const e = new MatchEngine(home, away);
  e.runToEnd(1 / 12);
  return e.result();
}
