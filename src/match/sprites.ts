// Frame-based cartoon player sprite sheets, generated per kit/look at runtime.
export const FRAME = 64;
export const SKINS = ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'];
export const HAIRS = ['#2b1b0e', '#5a3825', '#b5651d', '#e8c547', '#1a1a1a', '#d94f4f', '#8a8a8a'];

export type AnimName = 'idle' | 'run' | 'walk' | 'kick' | 'shoot' | 'tackle' | 'celebrate' | 'dive';
export const ANIMS: { name: AnimName; frames: number; fps: number; loop: boolean }[] = [
  { name: 'idle', frames: 2, fps: 2.5, loop: true },
  { name: 'run', frames: 6, fps: 12, loop: true },
  { name: 'walk', frames: 4, fps: 7, loop: true },
  { name: 'kick', frames: 3, fps: 14, loop: false },
  { name: 'shoot', frames: 4, fps: 12, loop: false },
  { name: 'tackle', frames: 3, fps: 9, loop: false },
  { name: 'celebrate', frames: 4, fps: 8, loop: true },
  { name: 'dive', frames: 3, fps: 9, loop: false },
];
export const TOTAL_FRAMES = ANIMS.reduce((s, a) => s + a.frames, 0);
export const animStart = (name: AnimName) => {
  let n = 0;
  for (const a of ANIMS) {
    if (a.name === name) return n;
    n += a.frames;
  }
  return 0;
};

interface Pose {
  bob: number;
  lean: number;
  lLeg: number;
  rLeg: number;
  lBend: number;
  rBend: number;
  lArm: number;
  rArm: number;
  dy?: number;
  open?: boolean;
}

function poseFor(name: AnimName, i: number, n: number): Pose {
  const t = i / n;
  const ph = t * Math.PI * 2;
  switch (name) {
    case 'idle':
      return { bob: Math.sin(ph) * 0.9, lean: 0.02, lLeg: 0.08, rLeg: -0.08, lBend: 0, rBend: 0, lArm: 0.12 + Math.sin(ph) * 0.05, rArm: -0.12 };
    case 'run':
      return {
        bob: -Math.abs(Math.sin(ph)) * 2.6, lean: 0.2,
        lLeg: Math.sin(ph) * 1.05, rLeg: -Math.sin(ph) * 1.05,
        lBend: 0.25 + 1.0 * Math.max(0, Math.sin(ph + 1.4)), rBend: 0.25 + 1.0 * Math.max(0, -Math.sin(ph + 1.4)),
        lArm: -Math.sin(ph) * 1.2, rArm: Math.sin(ph) * 1.2,
      };
    case 'walk':
      return {
        bob: -Math.abs(Math.sin(ph)) * 1.2, lean: 0.05,
        lLeg: Math.sin(ph) * 0.55, rLeg: -Math.sin(ph) * 0.55, lBend: 0.1 + 0.4 * Math.max(0, Math.sin(ph + 1.4)), rBend: 0.1 + 0.4 * Math.max(0, -Math.sin(ph + 1.4)),
        lArm: -Math.sin(ph) * 0.5, rArm: Math.sin(ph) * 0.5,
      };
    case 'kick': {
      const k = [{ r: -0.9, b: 1.3, l: 0.0 }, { r: 0.9, b: 0.3, l: 0.05 }, { r: 1.5, b: 0.0, l: 0.1 }][i];
      return { bob: 0, lean: i === 2 ? -0.05 : 0.08, lLeg: k.l, rLeg: k.r, lBend: 0.2, rBend: k.b, lArm: i === 1 ? -0.9 : 0.8, rArm: i === 1 ? 0.9 : -0.6 };
    }
    case 'shoot': {
      const k = [
        { r: -1.25, b: 1.7, lean: -0.12, bob: 0, la: 1.1, ra: -1.0 },
        { r: 1.2, b: 0.2, lean: 0.06, bob: -1, la: 1.3, ra: -0.9 },
        { r: 1.95, b: 0.0, lean: 0.22, bob: -3, la: 1.5, ra: -1.2 },
        { r: 0.7, b: 0.4, lean: 0.14, bob: 0, la: 0.7, ra: -0.5 },
      ][i];
      return { bob: k.bob, lean: k.lean, lLeg: 0.1, rLeg: k.r, lBend: 0.3, rBend: k.b, lArm: k.la, rArm: k.ra };
    }
    case 'tackle': {
      const lean = [-0.6, -1.1, -1.25][i];
      return { bob: 0, lean, dy: [3, 9, 12][i], lLeg: -1.0, rLeg: 1.55, lBend: 1.6, rBend: 0.0, lArm: -2.0, rArm: 2.2 };
    }
    case 'celebrate':
      return {
        bob: -Math.abs(Math.sin(ph / 2 + 0.3)) * 6, lean: -0.05, lLeg: 0.35, rLeg: -0.35, lBend: 0.5, rBend: 0.5,
        lArm: i % 2 === 0 ? 2.7 : 3.1, rArm: i % 2 === 0 ? -3.1 : -2.7, open: true,
      };
    case 'dive':
      return { bob: 0, lean: 1.45, dy: [-2, -6, -4][i], lLeg: 0.25 + i * 0.05, rLeg: -0.1, lBend: 0.3, rBend: 0.3, lArm: 3.0, rArm: 2.8, open: true };
  }
}

export interface Look {
  skin: number;
  hair: number;
  hairStyle: number;
  color: string;
  color2: string;
  gk: boolean;
}
export const lookKey = (l: Look) => `p${l.skin}${l.hair}${l.hairStyle}${l.gk ? 'g' : ''}${l.color}${l.color2}`.replace(/#/g, '');

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

function limb(c: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, w: number, col: string) {
  c.strokeStyle = col;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x, y);
  const ex = x + Math.sin(ang) * len;
  const ey = y + Math.cos(ang) * len;
  c.lineTo(ex, ey);
  c.stroke();
  return [ex, ey] as const;
}

function drawLeg(c: CanvasRenderingContext2D, ang: number, bend: number, look: Look, back: boolean) {
  const shorts = look.gk ? '#222b45' : look.color2;
  const sock = look.gk ? '#222b45' : look.color;
  const sh = back ? shade(sock, -35) : sock;
  const [kx, ky] = limb(c, 0, 0, ang, 7, 6.2, back ? shade(shorts, -35) : shorts);
  const a2 = ang - bend;
  const [fx, fy] = limb(c, kx, ky, a2, 7, 5, sh);
  // boot
  c.fillStyle = '#222';
  c.beginPath();
  c.ellipse(fx + 1.8, fy + 0.8, 4.2, 2.6, a2 * -0.4 + 0, 0, Math.PI * 2);
  c.fill();
}

function drawArm(c: CanvasRenderingContext2D, ang: number, look: Look, back: boolean) {
  const skin = SKINS[look.skin];
  const sleeve = look.gk ? look.color : look.color;
  const [ex, ey] = limb(c, 0, -12, ang, 4.2, 5, back ? shade(sleeve, -35) : sleeve);
  const [hx, hy] = limb(c, ex, ey, ang, 5, 4, back ? shade(skin, -25) : skin);
  if (look.gk) {
    c.fillStyle = '#ffd23f';
    c.beginPath();
    c.arc(hx, hy, 3.4, 0, Math.PI * 2);
    c.fill();
  }
}

function drawHead(c: CanvasRenderingContext2D, look: Look, open: boolean) {
  const skin = SKINS[look.skin];
  const hair = HAIRS[look.hair];
  const cx = 1.5;
  const cy = -27;
  const r = 12;
  // hair back
  c.fillStyle = hair;
  if (look.hairStyle === 2) {
    c.beginPath();
    c.arc(cx - 1, cy - 1, r + 2.5, 0, Math.PI * 2);
    c.fill();
  } else if (look.hairStyle === 3) {
    c.beginPath();
    c.ellipse(cx - 7, cy + 4, 6, 9, 0.2, 0, Math.PI * 2);
    c.fill();
  }
  // ear
  c.fillStyle = shade(skin, -18);
  c.beginPath();
  c.arc(cx - 9.5, cy + 2, 2.6, 0, Math.PI * 2);
  c.fill();
  // face
  c.fillStyle = skin;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();
  // hair top
  c.fillStyle = hair;
  c.beginPath();
  if (look.hairStyle === 1) {
    c.arc(cx - 1, cy - 2, r + 0.5, Math.PI * 1.05, Math.PI * 1.95);
    c.lineTo(cx + 9, cy - 9);
    c.lineTo(cx + 6, cy - 17);
    c.lineTo(cx + 2, cy - 11);
    c.lineTo(cx - 2, cy - 19);
    c.lineTo(cx - 5, cy - 11);
    c.lineTo(cx - 10, cy - 16);
  } else if (look.hairStyle === 2) {
    c.arc(cx - 1, cy - 3, r + 1, Math.PI * 1.0, Math.PI * 2.0);
  } else {
    c.arc(cx - 1, cy - 1, r + 0.8, Math.PI * 1.02, Math.PI * 1.98);
    c.lineTo(cx + 7, cy - 6);
    c.quadraticCurveTo(cx + 1, cy - 9, cx - 9, cy - 4);
  }
  c.closePath();
  c.fill();
  if (look.hairStyle === 3) {
    c.beginPath();
    c.arc(cx - 2, cy - 15.5, 4, 0, Math.PI * 2);
    c.fill();
  }
  // eye
  c.fillStyle = '#fff';
  c.beginPath();
  c.ellipse(cx + 5.2, cy - 0.5, 3.4, 4.2, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#1d2b53';
  c.beginPath();
  c.arc(cx + 6.4, cy, 2.1, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(cx + 7, cy - 0.8, 0.7, 0, Math.PI * 2);
  c.fill();
  // cheek + mouth
  c.fillStyle = 'rgba(255,107,107,0.35)';
  c.beginPath();
  c.arc(cx + 3, cy + 6, 2.6, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#7a2e2e';
  c.lineWidth = 1.5;
  c.lineCap = 'round';
  c.beginPath();
  if (open) {
    c.fillStyle = '#7a2e2e';
    c.ellipse(cx + 7, cy + 7, 2.8, 2.4, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    c.arc(cx + 6.5, cy + 5, 2.4, 0.2, Math.PI * 0.8);
    c.stroke();
  }
}

function drawFigure(c: CanvasRenderingContext2D, p: Pose, look: Look) {
  c.save();
  c.translate(FRAME / 2 - 1, 43 + p.bob + (p.dy ?? 0));
  c.rotate(p.lean);
  drawArm(c, p.lArm, look, true);
  drawLeg(c, p.lLeg, p.lBend, look, true);
  // torso
  c.fillStyle = look.color;
  c.beginPath();
  c.roundRect(-6.5, -15, 13, 17, 4);
  c.fill();
  if (!look.gk) {
    c.fillStyle = look.color2;
    c.fillRect(-6.5, -9, 13, 3.2);
  }
  c.fillStyle = look.gk ? '#222b45' : look.color2;
  c.beginPath();
  c.roundRect(-6.5, -1, 13, 5, 2);
  c.fill();
  drawLeg(c, p.rLeg, p.rBend, look, false);
  drawArm(c, p.rArm, look, false);
  drawHead(c, look, !!p.open);
  c.restore();
}

/** Build a sprite-sheet canvas holding every animation frame in one row. */
export function buildSheet(look: Look): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = FRAME * TOTAL_FRAMES;
  cv.height = FRAME;
  const c = cv.getContext('2d')!;
  let col = 0;
  for (const a of ANIMS) {
    for (let i = 0; i < a.frames; i++) {
      c.save();
      c.translate(col * FRAME, 0);
      drawFigure(c, poseFor(a.name, i, a.frames), look);
      c.restore();
      col++;
    }
  }
  return cv;
}

export function buildBall(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 20;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(10, 10, 9, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#222b45';
  c.beginPath();
  c.arc(10, 10, 3.2, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    c.beginPath();
    c.arc(10 + Math.cos(a) * 8, 10 + Math.sin(a) * 8, 2.4, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = '#222b45';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(10, 10, 9, 0, Math.PI * 2);
  c.stroke();
  return cv;
}
