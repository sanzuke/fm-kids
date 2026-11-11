import { MatchEngine, H, W, type MatchEvent } from '../game/engine';
import { crowdCheer, sfx } from '../audio';

export type MatchMode = 'watch' | 'highlights' | 'quick';
const STEP = 1 / 30;

export class MatchController {
  engine: MatchEngine;
  speed = 1;
  paused = false;
  mode: MatchMode;
  camMode: 'follow' | 'wide' = 'follow';
  private accum = 0;
  private lastShotSound = 0;
  eventListeners = new Set<(e: MatchEvent) => void>();

  constructor(engine: MatchEngine, mode: MatchMode) {
    this.engine = engine;
    this.mode = mode;
    engine.onEvent = (e) => {
      if (e.type === 'goal') { sfx.goal(); crowdCheer(1); }
      else if (e.type === 'shot') { sfx.shot(); crowdCheer(0.3); }
      else if (e.type === 'save') { sfx.save(); crowdCheer(0.45); }
      else if (e.type === 'ht' || e.type === 'ft' || e.type === 'kickoff' || e.type === 'foul' || e.type === 'offside') sfx.whistle();
      else if (e.type === 'card' || e.type === 'injury') sfx.whistle();
      else if (e.type === 'sub' || e.type === 'talk') sfx.click();
      this.eventListeners.forEach((f) => f(e));
    };
  }

  /** Is something exciting happening? Used by highlights mode. */
  private hot() {
    const e = this.engine;
    if (e.phase === 'goal' || e.ball.shot) return true;
    const b = e.ball;
    const dg = Math.min(Math.hypot(b.x - W, b.y - H / 2), Math.hypot(b.x, b.y - H / 2));
    return dg < 30;
  }

  tick(dt: number) {
    const e = this.engine;
    if (this.paused || e.phase === 'ft' || e.phase === 'ht') return;
    let mult = this.speed;
    if (this.mode === 'highlights') mult = this.hot() ? 1 : 9;
    this.accum += Math.min(dt, 0.1) * mult;
    let n = 0;
    while (this.accum >= STEP && n < 14) {
      e.step(STEP);
      this.accum -= STEP;
      n++;
      if ((e.phase as string) === 'ft' || (e.phase as string) === 'ht') break;
    }
    if (n >= 14) this.accum = 0;
    void this.lastShotSound;
  }

  skipToEnd() {
    this.engine.runToEnd(1 / 15);
  }
}
