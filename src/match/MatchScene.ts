import Phaser from 'phaser';
import { H, W, type Agent, type MatchEvent } from '../game/engine';
import { shirtOf } from '../game/world';
import { ANIMS, FRAME, animStart, buildBall, buildSheet, lookKey, type AnimName, type Look } from './sprites';
import type { MatchController } from './controller';
import { t } from '../i18n';

const S = 14; // pixels per metre
const M = 7; // margin in metres (crowd area)
const px = (x: number) => (x + M) * S;
const py = (y: number) => (y + M) * S;
const SPRITE_SCALE = 0.78;

interface Actor {
  spr: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  /** shirt number floating over the player; the sprite is too small to print it on the back */
  num?: Phaser.GameObjects.Text;
  key: string;
  anim: string;
}

export class MatchScene extends Phaser.Scene {
  ctl!: MatchController;
  actors = new Map<number, Actor>();
  ball!: Phaser.GameObjects.Image;
  ballShadow!: Phaser.GameObjects.Ellipse;
  marker!: Phaser.GameObjects.Text;
  nameTag!: Phaser.GameObjects.Text;
  banner!: Phaser.GameObjects.Text;
  confetti?: Phaser.GameObjects.Particles.ParticleEmitter;
  camTarget = { x: 0, y: 0 };
  looks = new Map<number, Look>();

  constructor() {
    super('match');
  }

  create() {
    this.ctl = this.registry.get('ctl') as MatchController;
    this.drawPitch();
    this.textures.addCanvas('ball', buildBall());
    const px2 = document.createElement('canvas');
    px2.width = px2.height = 8;
    const c = px2.getContext('2d')!;
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 8, 8);
    this.textures.addCanvas('conf', px2);

    this.ballShadow = this.add.ellipse(0, 0, 12, 6, 0x000000, 0.3).setDepth(1);
    this.ball = this.add.image(0, 0, 'ball').setScale(0.75).setDepth(9000);
    this.marker = this.add.text(0, 0, '▼', { fontSize: '18px', color: '#ffd23f', stroke: '#1d2b53', strokeThickness: 4 }).setOrigin(0.5).setDepth(9500);
    this.nameTag = this.add
      .text(0, 0, '', { fontFamily: 'Fredoka, Trebuchet MS, sans-serif', fontSize: '15px', color: '#ffffff', stroke: '#1d2b53', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(9500);
    this.banner = this.add
      .text(0, 0, t('GOAL!'), { fontFamily: 'Fredoka, Trebuchet MS, sans-serif', fontSize: '110px', fontStyle: 'bold', color: '#ffd23f', stroke: '#e63946', strokeThickness: 14 })
      .setOrigin(0.5)
      .setDepth(20000)
      .setScrollFactor(0)
      .setVisible(false);
    this.confetti = this.add.particles(0, 0, 'conf', {
      speed: { min: 150, max: 420 },
      angle: { min: 200, max: 340 },
      gravityY: 520,
      lifespan: 2200,
      scale: { start: 1.1, end: 0.4 },
      rotate: { min: 0, max: 360 },
      tint: [0xff6b6b, 0xffd23f, 0x4cc9f0, 0x7ed957, 0xff5fa2],
      emitting: false,
    });
    this.confetti.setDepth(21000);

    this.cameras.main.setBounds(0, 0, (W + M * 2) * S, (H + M * 2) * S);
    this.camTarget = { x: px(W / 2), y: py(H / 2) };
    this.cameras.main.centerOn(this.camTarget.x, this.camTarget.y);
    this.scale.on('resize', () => this.fitCamera());
    this.fitCamera();

    this.ctl.eventListeners.add((e) => this.onEvent(e));
    this.events.on('shutdown', () => this.ctl.eventListeners.clear());
  }

  private wideZoom() {
    const w = this.scale.width;
    const h = this.scale.height;
    return Math.min(w / ((W + 8) * S), h / ((H + 8) * S));
  }

  fitCamera() {
    const cam = this.cameras.main;
    const wide = this.wideZoom();
    const w = this.scale.width;
    const follow = Phaser.Math.Clamp(w / (S * 44), wide * 1.25, 2.4);
    cam.setZoom(this.ctl.camMode === 'wide' ? wide : follow);
  }

  private onEvent(e: MatchEvent) {
    if (e.type === 'goal') {
      this.cameras.main.shake(350, 0.004);
      this.cameras.main.flash(250, 255, 255, 255, false);
      this.banner.setPosition(this.scale.width / 2, this.scale.height * 0.35).setVisible(true).setScale(0.2).setAlpha(1);
      this.tweens.add({ targets: this.banner, scale: 1, duration: 450, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.banner, alpha: 0, delay: 2600, duration: 700, onComplete: () => this.banner.setVisible(false) });
      const b = this.ctl.engine.ball;
      const x = this.cameras.main.scrollX + this.scale.width / 2 / this.cameras.main.zoom;
      const y = this.cameras.main.scrollY + this.scale.height * 0.1;
      void b;
      this.confetti?.explode(60, x, y);
    }
  }

  private drawPitch() {
    const g = this.add.graphics().setDepth(-10);
    const totalW = (W + M * 2) * S;
    const totalH = (H + M * 2) * S;
    // surrounding area + crowd
    g.fillStyle(0x2c3e6b, 1).fillRect(0, 0, totalW, totalH);
    const rng = new Phaser.Math.RandomDataGenerator(['crowd']);
    const cols = [0xff6b6b, 0xffd23f, 0x4cc9f0, 0x7ed957, 0xff5fa2, 0xffffff, 0xff8c1a, 0xb28dff];
    for (let i = 0; i < 1500; i++) {
      const side = rng.between(0, 3);
      let x = 0;
      let y = 0;
      if (side < 2) {
        x = rng.between(6, totalW - 6);
        y = side === 0 ? rng.between(6, M * S - 40) : rng.between(totalH - M * S + 40, totalH - 6);
      } else {
        y = rng.between(6, totalH - 6);
        x = side === 2 ? rng.between(6, M * S - 40) : rng.between(totalW - M * S + 40, totalW - 6);
      }
      g.fillStyle(rng.pick(cols), 1).fillCircle(x, y, rng.between(4, 7));
    }
    // ad boards
    g.fillStyle(0x1d2b53, 1).fillRect(M * S - 30, M * S - 30, (W * S) + 60, 30);
    g.fillRect(M * S - 30, (M + H) * S, (W * S) + 60, 30);
    g.fillStyle(0xffd23f, 1);
    for (let i = 0; i < 12; i++) {
      g.fillRect(M * S - 20 + i * ((W * S) / 12), M * S - 22, 40, 14);
      g.fillRect(M * S - 20 + i * ((W * S) / 12), (M + H) * S + 8, 40, 14);
    }
    // grass stripes
    const stripes = 14;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle(i % 2 === 0 ? 0x3cc46a : 0x35b45f, 1).fillRect(px(0) + (i * W * S) / stripes, py(0), (W * S) / stripes + 1, H * S);
    }
    // lines
    g.lineStyle(4, 0xffffff, 0.95);
    g.strokeRect(px(0), py(0), W * S, H * S);
    g.lineBetween(px(W / 2), py(0), px(W / 2), py(H));
    g.strokeCircle(px(W / 2), py(H / 2), 9.15 * S);
    g.fillStyle(0xffffff, 1).fillCircle(px(W / 2), py(H / 2), 5);
    for (const side of [0, 1]) {
      const dir = side === 0 ? 1 : -1;
      const x0 = side === 0 ? 0 : W;
      g.strokeRect(side === 0 ? px(0) : px(W - 16.5), py(H / 2 - 20.15), 16.5 * S, 40.3 * S);
      g.strokeRect(side === 0 ? px(0) : px(W - 5.5), py(H / 2 - 9.16), 5.5 * S, 18.32 * S);
      g.fillCircle(px(x0 + dir * 11), py(H / 2), 4);
      // goal
      const gw = 3 * S;
      g.fillStyle(0xffffff, 0.35).fillRect(side === 0 ? px(0) - gw : px(W), py(H / 2 - 3.66), gw, 7.32 * S);
      g.lineStyle(2, 0xffffff, 0.8);
      for (let k = 0; k <= 7; k++) g.lineBetween(side === 0 ? px(0) - gw : px(W), py(H / 2 - 3.66) + (k * 7.32 * S) / 7, side === 0 ? px(0) : px(W) + gw, py(H / 2 - 3.66) + (k * 7.32 * S) / 7);
      for (let k = 0; k <= 3; k++) g.lineBetween((side === 0 ? px(0) - gw : px(W)) + (k * gw) / 3, py(H / 2 - 3.66), (side === 0 ? px(0) - gw : px(W)) + (k * gw) / 3, py(H / 2 + 3.66));
      g.lineStyle(6, 0xffffff, 1);
      g.strokeRect(side === 0 ? px(0) - gw : px(W), py(H / 2 - 3.66), gw, 7.32 * S);
      g.lineStyle(4, 0xffffff, 0.95);
      g.fillStyle(0xffffff, 1);
    }
  }

  private ensureLook(a: Agent): Actor {
    const ex = this.actors.get(a.id);
    if (ex) return ex;
    const setup = this.ctl.engine.setups[a.side];
    const gk = a.slotPos === 'GK';
    const look: Look = {
      skin: a.player.skin, hair: a.player.hair, hairStyle: a.player.hairStyle,
      color: gk ? setup.gkColor : setup.color, color2: setup.color2, gk,
      pattern: (setup as { pattern?: number }).pattern ?? 0,
    };
    const key = lookKey(look);
    if (!this.textures.exists(key)) {
      const tex = this.textures.addCanvas(key, buildSheet(look))!;
      let n = 0;
      for (const an of ANIMS) {
        for (let i = 0; i < an.frames; i++) {
          tex.add(`${an.name}${i}`, 0, n * FRAME, 0, FRAME, FRAME);
          n++;
        }
        const ak = `${key}:${an.name}`;
        if (!this.anims.exists(ak)) {
          this.anims.create({
            key: ak,
            frames: Array.from({ length: an.frames }, (_, i) => ({ key, frame: `${an.name}${i}` })),
            frameRate: an.fps,
            repeat: an.loop ? -1 : 0,
          });
        }
      }
    }
    void animStart;
    const shadow = this.add.ellipse(0, 0, 30, 12, 0x000000, 0.28).setDepth(2);
    const spr = this.add.sprite(0, 0, key, 'idle0').setOrigin(0.5, 0.9).setScale(SPRITE_SCALE);
    const act: Actor = { spr, shadow, key, anim: '' };
    const n = shirtOf(a.player);
    if (n !== undefined) {
      act.num = this.add
        .text(0, 0, String(n), { fontFamily: 'Fredoka, Trebuchet MS, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#ffffff', stroke: '#1d2b53', strokeThickness: 3 })
        .setOrigin(0.5, 1);
    }
    this.actors.set(a.id, act);
    this.looks.set(a.id, look);
    return act;
  }

  private play(act: Actor, name: AnimName, timeScale = 1, force = false) {
    const k = `${act.key}:${name}`;
    if (act.anim !== k || force) {
      act.anim = k;
      act.spr.play(k);
    }
    act.spr.anims.timeScale = timeScale;
  }

  update(_t: number, delta: number) {
    const ctl = this.ctl;
    ctl.tick(delta / 1000);
    const e = ctl.engine;
    const seen = new Set<number>();
    const all: Agent[] = [...e.agents, ...e.leaving];
    for (const a of all) {
      seen.add(a.id);
      const act = this.ensureLook(a);
      const x = px(a.x);
      const y = py(a.y);
      act.spr.setPosition(x, y);
      act.shadow.setPosition(x, y + 2);
      act.spr.setDepth(100 + y);
      act.num?.setPosition(x, y - 42).setDepth(100 + y + 1).setVisible(a.state !== 'dive');
      let name: AnimName = 'idle';
      let ts = 1;
      const sp = Math.hypot(a.vx, a.vy);
      switch (a.state) {
        case 'run': name = 'run'; ts = Phaser.Math.Clamp(sp / 6.2, 0.6, 1.5); break;
        case 'walk': name = 'walk'; ts = Phaser.Math.Clamp(sp / 2.2, 0.6, 1.3); break;
        case 'kick': name = 'kick'; break;
        case 'shoot': name = 'shoot'; break;
        case 'tackle': name = 'tackle'; break;
        case 'fallen': name = 'tackle'; break;
        case 'celebrate': name = 'celebrate'; break;
        case 'dive': name = 'dive'; break;
        default: name = 'idle';
      }
      this.play(act, name, ts);
      act.spr.setFlipX(a.face < 0);
      if (a.state === 'dive') {
        act.spr.setFlipX(false);
        act.spr.setAngle(a.diveDir < 0 ? -88 : 88);
        act.spr.setOrigin(0.5, 0.62);
      } else {
        act.spr.setAngle(0);
        act.spr.setOrigin(0.5, 0.9);
      }
      act.spr.setAlpha(a.leaving ? 0.9 : 1);
    }
    for (const [id, act] of this.actors) {
      if (!seen.has(id)) {
        act.spr.destroy();
        act.shadow.destroy();
        act.num?.destroy();
        this.actors.delete(id);
      }
    }

    // ball
    const b = e.ball;
    const bx = px(b.x);
    const by = py(b.y);
    this.ball.setPosition(bx, by - b.z * S * 0.8 - 5);
    this.ball.setScale(0.75 + b.z * 0.03);
    this.ball.setDepth(100 + by + 3);
    const bs = Math.hypot(b.vx, b.vy);
    this.ball.rotation += (b.owner ? Math.hypot(b.owner.vx, b.owner.vy) : bs) * 0.012 * (delta / 16);
    this.ballShadow.setPosition(bx, by + 2).setScale(1 - Math.min(0.5, b.z * 0.1));

    // ball-carrier marker
    const o = b.owner;
    if (o && e.phase !== 'goal') {
      this.marker.setVisible(true).setPosition(px(o.x), py(o.y) - 66 + Math.sin(this.time.now / 140) * 3).setDepth(9500);
      this.nameTag.setVisible(true).setText(o.player.name.split(' ')[0]).setPosition(px(o.x), py(o.y) - 84).setDepth(9500);
      this.marker.setColor(e.setups[o.side].isUser ? '#ffd23f' : '#ff8c8c');
    } else if (e.phase === 'goal' && e.scorerAgent) {
      const s = e.scorerAgent;
      this.marker.setVisible(false);
      this.nameTag.setVisible(true).setText(s.player.name.split(' ')[0]).setPosition(px(s.x), py(s.y) - 80).setDepth(9500);
    } else {
      this.marker.setVisible(false);
      this.nameTag.setVisible(false);
    }

    // camera
    const cam = this.cameras.main;
    const wide = ctl.camMode === 'wide';
    const target = wide ? { x: px(W / 2), y: py(H / 2) } : { x: bx, y: by };
    const k = 1 - Math.pow(0.001, delta / 1000 * 1.2);
    this.camTarget.x += (target.x - this.camTarget.x) * k;
    this.camTarget.y += (target.y - this.camTarget.y) * k;
    cam.centerOn(this.camTarget.x, this.camTarget.y);
    const zoomNow = cam.zoom;
    const want = wide ? this.wideZoom() : Phaser.Math.Clamp(this.scale.width / (S * 44), this.wideZoom() * 1.25, 2.4);
    if (Math.abs(zoomNow - want) > 0.002) cam.setZoom(zoomNow + (want - zoomNow) * 0.12);
  }
}
