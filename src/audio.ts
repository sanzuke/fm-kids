// Sound: synth effects and stadium ambience made with WebAudio, plus one recorded music track.
import musicUrl from './assets/match-day-fun.mp3';
import crowdLoopUrl from './assets/crowd-loop.mp3';
import crowdCheerUrl from './assets/crowd-cheer.mp3';
import crowdOohUrl from './assets/crowd-ooh.mp3';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxOn = true;
let musicOn = true;
let vol = 0.6;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = vol;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function configureAudio(s: { sound: boolean; music: boolean; volume: number }) {
  sfxOn = s.sound;
  vol = s.volume;
  if (master) master.gain.value = vol;
  if (s.music !== musicOn) {
    musicOn = s.music;
    if (!musicOn) {
      stopMusic();
      stopCrowd();
    } else if (crowdWanted) startCrowd();
    else if (musicWanted) startMusic();
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.2, delay = 0, slide = 0) {
  const c = ac();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + delay;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, gain = 0.15, delay = 0, freq = 1200) {
  const c = ac();
  if (!c || !master) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(c.currentTime + delay);
}

export const sfx = {
  click: () => sfxOn && tone(660, 0.07, 'triangle', 0.15),
  good: () => sfxOn && (tone(523, 0.1, 'triangle', 0.18), tone(784, 0.15, 'triangle', 0.18, 0.09)),
  bad: () => sfxOn && tone(220, 0.2, 'sawtooth', 0.12, 0, -80),
  kick: () => sfxOn && (tone(180, 0.09, 'sine', 0.3, 0, -90), noise(0.05, 0.1, 0, 800)),
  shot: () => sfxOn && (tone(140, 0.14, 'sine', 0.35, 0, -80), noise(0.1, 0.18, 0, 1500)),
  whistle: () => sfxOn && (tone(2300, 0.25, 'sine', 0.15), tone(2400, 0.25, 'sine', 0.15, 0.3)),
  save: () => sfxOn && (noise(0.12, 0.25, 0, 500), tone(200, 0.1, 'square', 0.1)),
  goal: () => {
    if (!sfxOn) return;
    // the recorded crowd roars in a watched match; the synth roar covers quick results
    if (!crowdBus) noise(1.6, 0.2, 0, 900);
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.2, i * 0.12));
  },
  coin: () => sfxOn && (tone(988, 0.07, 'square', 0.1), tone(1319, 0.2, 'square', 0.1, 0.07)),
};

let musicWanted = false;

// Background music: the "Match Day Fun" track, looped. It plays through the same volume
// control as the effects, and pauses (keeping its place) while a match's stadium sound is on.
let musicEl: HTMLAudioElement | null = null;
let musicBus: GainNode | null = null;
let musicPlaying = false;
let pauseTimer: number | undefined;
const MUSIC_LEVEL = 0.55;

export function startMusic() {
  musicWanted = true;
  if (!musicOn || crowdWanted || musicPlaying) return;
  const c = ac();
  if (!c || !master) return;
  if (!musicEl) {
    musicEl = new Audio(musicUrl);
    musicEl.loop = true;
    musicEl.preload = 'auto';
    musicBus = c.createGain();
    c.createMediaElementSource(musicEl).connect(musicBus).connect(master);
  }
  if (!musicBus) return;
  window.clearTimeout(pauseTimer);
  musicPlaying = true;
  musicBus.gain.cancelScheduledValues(c.currentTime);
  musicBus.gain.setValueAtTime(0.0001, c.currentTime);
  musicBus.gain.linearRampToValueAtTime(MUSIC_LEVEL, c.currentTime + 0.6);
  // play() is refused until the player has tapped once; the splash tap calls this again
  musicEl.play().catch(() => {
    musicPlaying = false;
  });
}
export function stopMusic() {
  if (!musicPlaying || !ctx || !musicBus || !musicEl) return;
  musicPlaying = false;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
  const el = musicEl;
  pauseTimer = window.setTimeout(() => el.pause(), 400);
}
export function wantMusic(on: boolean) {
  musicWanted = on;
  if (on) {
    startMusic();
    // fetch the stadium sounds now so the first match starts with them ready
    if (ctx) void loadCrowd(ctx);
  } else stopMusic();
}

// Stadium ambience for watched matches, cut from one real crowd recording: a seamless
// murmur loop, a short "ooh" for shots and saves, and a roar for goals. Replaces the music while on.
const CROWD_LEVEL = 0.9;
let crowdWanted = false;
let crowdBus: GainNode | null = null;
let crowdLoop: AudioBufferSourceNode | null = null;
let crowdSounds: { loop: AudioBuffer; cheer: AudioBuffer; ooh: AudioBuffer } | null = null;
let crowdLoading: Promise<void> | null = null;
let crowdFailed = false;
let lastOoh = 0;

function loadCrowd(c: AudioContext): Promise<void> {
  crowdLoading ??= (async () => {
    try {
      const [loop, cheer, ooh] = await Promise.all(
        [crowdLoopUrl, crowdCheerUrl, crowdOohUrl].map(async (url) => c.decodeAudioData(await (await fetch(url)).arrayBuffer())),
      );
      crowdSounds = { loop, cheer, ooh };
    } catch {
      crowdFailed = true;
    }
  })();
  return crowdLoading;
}

function startCrowd() {
  if (!musicOn || crowdBus) return;
  const c = ac();
  if (!c || !master) return;
  if (!crowdSounds) {
    // still downloading: start as soon as it is ready; if it cannot load, keep the music instead of silence
    void loadCrowd(c).then(() => {
      if (!crowdWanted) return;
      if (crowdSounds) startCrowd();
      else if (crowdFailed && musicWanted) {
        crowdWanted = false;
        startMusic();
      }
    });
    return;
  }
  crowdBus = c.createGain();
  crowdBus.gain.setValueAtTime(0.0001, c.currentTime);
  crowdBus.gain.linearRampToValueAtTime(CROWD_LEVEL, c.currentTime + 0.8);
  crowdBus.connect(master);
  const src = c.createBufferSource();
  src.buffer = crowdSounds.loop;
  src.loop = true;
  // skip the few silent milliseconds an mp3 carries at each end, so the loop has no gap
  src.loopStart = 0.06;
  src.loopEnd = crowdSounds.loop.duration - 0.12;
  src.connect(crowdBus);
  src.start(c.currentTime, 0.06 + Math.random() * 30);
  crowdLoop = src;
}

function stopCrowd() {
  if (!ctx || !crowdBus) return;
  const bus = crowdBus;
  const src = crowdLoop;
  crowdBus = null;
  crowdLoop = null;
  bus.gain.cancelScheduledValues(ctx.currentTime);
  bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
  src?.stop(ctx.currentTime + 0.7);
  window.setTimeout(() => bus.disconnect(), 900);
}

/** Crowd reacts: 0..1, small for a shot or save, 1 for a goal. */
export function crowdCheer(intensity: number) {
  if (!ctx || !crowdBus || !crowdSounds) return;
  const big = intensity >= 1;
  // a small reaction is not repeated while the last one is still ringing
  if (!big && ctx.currentTime - lastOoh < 4) return;
  if (!big) lastOoh = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = big ? crowdSounds.cheer : crowdSounds.ooh;
  const g = ctx.createGain();
  g.gain.value = big ? 1 : 0.35 + intensity * 0.6;
  src.connect(g).connect(crowdBus);
  src.start();
}

/** Switch the backing sound to stadium ambience for a watched match, and back to music afterwards. */
export function matchAmbience(on: boolean) {
  crowdWanted = on;
  if (on) {
    stopMusic();
    startCrowd();
  } else {
    stopCrowd();
    if (musicWanted) startMusic();
  }
}
