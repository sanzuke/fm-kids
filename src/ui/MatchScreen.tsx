import { useEffect, useMemo, useRef, useState } from 'react';
import { useG, useStore } from '../store';
import { Btn, Logo, Modal, OvrBadge, PosBadge, ShirtNo } from './kit';
import { MatchEngine, type MatchResult, MATCH_SECONDS } from '../game/engine';
import { MatchController, type MatchMode } from '../match/controller';
import { finishUserMatch, matchSetups, playFriendly, playContinental, userFixture, P, type UserMatchOutcome } from '../game/world';
import type { Fixture } from '../game/types';
import { matchAmbience, sfx } from '../audio';
import { t, tx } from '../i18n';

interface Snap {
  minute: number;
  score: [number, number];
  phase: string;
  subs: [number, number];
  feed: { id: number; text: string }[];
  paused: boolean;
}

function isLight(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return false;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.62;
}

function snap(ctl: MatchController): Snap {
  const e = ctl.engine;
  return {
    minute: e.minute, score: [e.score[0], e.score[1]], phase: e.phase, subs: [e.subsLeft[0], e.subsLeft[1]], paused: ctl.paused,
    feed: e.events.filter((ev) => ev.type !== 'kickoff' && ev.t > e.time - 9 && e.time - ev.t < 9).slice(-3).map((ev, i) => ({ id: ev.t * 1000 + i, text: ev.text })),
  };
}

function StatsPanel({ engine, res }: { engine: MatchEngine; res: MatchResult }) {
  const [h, a] = engine.setups;
  const rows: [string, number, number][] = [
    ['Possession %', res.stats[0].poss, res.stats[1].poss], ['Shots', res.stats[0].shots, res.stats[1].shots],
    ['On target', res.stats[0].sot, res.stats[1].sot], ['Passes', res.stats[0].passOk, res.stats[1].passOk],
    ['Tackles', res.stats[0].tackles, res.stats[1].tackles], ['Fouls', res.stats[0].fouls, res.stats[1].fouls],
    ['Corners', res.stats[0].corners, res.stats[1].corners], ['Offsides', res.stats[0].offsides, res.stats[1].offsides],
    ['Yellow cards', res.stats[0].yellows, res.stats[1].yellows], ['Red cards', res.stats[0].reds, res.stats[1].reds],
  ];
  const goals = res.events.filter((e) => e.type === 'goal');
  const best = res.players.slice().sort((p, q) => q.rating - p.rating)[0];
  return (
    <div>
      <div className="statrow" style={{ fontSize: 14 }}><b>{h.name}</b><span /><b>{a.name}</b></div>
      {rows.map(([l, x, y]) => (
        <div className="statrow" key={l}>
          <span>{x}</span><span className="muted">{t(l)}</span><span>{y}</span>
          <div className="sbar"><i style={{ width: `${(x / Math.max(1, x + y)) * 100}%`, background: h.color }} /><i style={{ width: `${(y / Math.max(1, x + y)) * 100}%`, background: a.color }} /></div>
        </div>
      ))}
      {goals.length > 0 && <div style={{ marginTop: 8 }}>{goals.map((e, i) => <div key={i} className="news">{tx(e.text)}</div>)}</div>}
      {best && <p style={{ marginTop: 8 }}>⭐ <b>{t('Player of the match:')}</b> {best.name} ({best.rating})</p>}
    </div>
  );
}

export function MatchScreen() {
  const g = useG();
  const { params, go, commit, say } = useStore();
  const stageRef = useRef<HTMLDivElement>(null);
  const [fixture] = useState<Fixture | undefined>(() =>
    params.continental ? playContinental(g) ?? undefined : params.friendly ? playFriendly(g, (params.friendly as { opp: number }).opp, (params.friendly as { home: boolean }).home) : userFixture(g));
  const mode = ((params.mode as MatchMode) ?? g.settings.defaultMode) as MatchMode;
  const ctl = useMemo(() => {
    if (!fixture) return null;
    const [h, a] = matchSetups(g, fixture);
    const c = new MatchController(new MatchEngine(h, a), mode);
    if (mode === 'quick') c.skipToEnd();
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [s, setS] = useState<Snap | null>(() => (ctl ? snap(ctl) : null));
  const [speed, setSpeed] = useState(1);
  const [cur, setCur] = useState<MatchMode>(mode);
  const [cam, setCam] = useState<'follow' | 'wide'>('follow');
  const [subOpen, setSubOpen] = useState(false);
  const [subOut, setSubOut] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<UserMatchOutcome | null>(null);
  const [bump, setBump] = useState(0);
  const [talked, setTalked] = useState(false);
  const committed = useRef(false);
  const lastScore = useRef(0);

  // Phaser game
  useEffect(() => {
    if (!ctl || mode === 'quick' || !stageRef.current) return;
    let game: { destroy: (b: boolean) => void } | null = null;
    let dead = false;
    (async () => {
      const [PM, SM] = await Promise.all([import('phaser'), import('../match/MatchScene')]);
      if (dead || !stageRef.current) return;
      const Phaser = (PM as unknown as { default: typeof import('phaser') }).default ?? PM;
      const el = stageRef.current;
      game = new Phaser.Game({
        type: Phaser.AUTO, parent: el, backgroundColor: '#1d2b53', audio: { noAudio: true },
        scale: { mode: Phaser.Scale.RESIZE, width: el.clientWidth || 800, height: el.clientHeight || 500 },
        scene: [SM.MatchScene], render: { antialias: true },
        callbacks: { preBoot: (gm) => gm.registry.set('ctl', ctl) },
      });
    })();
    return () => {
      dead = true;
      game?.destroy(true);
    };
  }, [ctl, mode]);

  // stadium ambience replaces the music while a match is on screen
  useEffect(() => {
    if (!ctl || mode === 'quick') return;
    matchAmbience(true);
    return () => matchAmbience(false);
  }, [ctl, mode]);

  // HUD polling
  useEffect(() => {
    if (!ctl) return;
    const t = setInterval(() => {
      const n = snap(ctl);
      setS(n);
      const sc = n.score[0] + n.score[1];
      if (sc !== lastScore.current) {
        lastScore.current = sc;
        setBump((b) => b + 1);
      }
    }, 120);
    return () => clearInterval(t);
  }, [ctl]);

  // commit result once at full time
  const done = s?.phase === 'ft';
  useEffect(() => {
    if (!ctl || !fixture || !done || committed.current) return;
    committed.current = true;
    const res = ctl.engine.result();
    commit((x) => {
      setOutcome(finishUserMatch(x, fixture, res));
    });
    if (res.score[0] !== res.score[1] || true) sfx.good();
  }, [done, ctl, fixture, commit]);

  if (!ctl || !fixture || !s) {
    return (
      <div className="wrap" style={{ padding: 20 }}>
        <div className="card"><h2>{t('No match to play')}</h2><p>{t('Nothing scheduled this week.')}</p><Btn onClick={() => go('dashboard')}>{t('Back')}</Btn></div>
      </div>
    );
  }
  const e = ctl.engine;
  const [hs, as] = e.setups;
  const userSide = hs.isUser ? 0 : 1;
  const res = done ? e.result() : null;
  const ht = s.phase === 'ht';
  const clock = `${String(s.minute).padStart(2, '0')}'`;

  const exit = () => {
    if (!done && !window.confirm(t('Leave the match? Your result will not be saved.'))) return;
    go('dashboard');
  };
  const setSp = (v: number) => { ctl.speed = v; setSpeed(v); };
  const togglePause = () => { ctl.paused = !ctl.paused; setS(snap(ctl)); };

  const field = e.agents.filter((a) => a.side === userSide).sort((a, b) => a.slot - b.slot);
  const benchP = e.setups[userSide].bench;

  const doSub = (inId: number) => {
    if (subOut === null) return;
    const p = P(g, inId);
    if (e.substitute(userSide as 0 | 1, subOut, p)) {
      say(`🔄 ${p.name} comes on!`);
      setSubOpen(false);
      setSubOut(null);
      ctl.paused = false;
      setS(snap(ctl));
    }
  };

  const Team = ({ i }: { i: 0 | 1 }) => {
    const st = e.setups[i];
    const c = g.clubs[st.clubId] ?? { name: st.name, icon: 0 } as typeof g.clubs[number];
    // dark text on light kits (white, yellow), white text on the rest
    const light = isLight(st.color);
    return (
      <div className="sb-team" style={{ flexDirection: i === 0 ? 'row' : 'row-reverse', background: st.color, color: light ? '#1d2b53' : '#fff' }}>
        <Logo icon={c.icon} color={st.color} color2={st.color2} size={30} />
        <span className="n" style={{ textShadow: light ? 'none' : '0 2px 0 rgba(0,0,0,.5)' }}>{st.name}</span>
      </div>
    );
  };

  return (
    <div className="match">
      <div className="match-stage" ref={stageRef}>
        <div className="scoreboard" aria-live="polite">
          <Team i={0} />
          <div className="sb-score"><b key={`a${s.score[0]}`} className={bump ? 'bump' : ''}>{s.score[0]}</b>–<b key={`b${s.score[1]}`} className={bump ? 'bump' : ''}>{s.score[1]}</b></div>
          <Team i={1} />
          <div className="sb-time">{done ? t('FT') : ht ? t('HT') : clock}</div>
        </div>
        <div className="ticker">{s.feed.map((f) => <div key={f.id}>{tx(f.text)}</div>)}</div>
        {mode === 'quick' && <div className="overlay" style={{ background: 'linear-gradient(#4cc9f0,#d8f7d0)' }} />}

        {ht && !done && (
          <div className="overlay">
            <div className="card pop" style={{ maxWidth: 520, width: '100%' }}>
              <h2 style={{ textAlign: 'center' }}>{t('⏸️ Half time: {a} – {b}', { a: s.score[0], b: s.score[1] })}</h2>
              <StatsPanel engine={e} res={e.result()} />
              <div className="row" style={{ marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {(['pep', 'scold', 'focus'] as const).map((k) => (
                  <Btn key={k} small kind={talked ? 'ghost' : 'blue'} disabled={talked}
                    onClick={() => { e.teamTalk(userSide as 0 | 1, k); setTalked(true); setS(snap(ctl)); }}>
                    {k === 'pep' ? t('📣 Pep talk') : k === 'scold' ? t('😤 Hard talk') : t('🧠 Focus defending')}
                  </Btn>
                ))}
              </div>
              <div className="row" style={{ marginTop: 10, justifyContent: 'center' }}>
                <Btn kind="blue" disabled={s.subs[userSide] <= 0} onClick={() => { setSubOpen(true); }}>{t('🔄 Substitutions ({n})', { n: s.subs[userSide] })}</Btn>
                <Btn kind="green" onClick={() => { e.resumeSecondHalf(); setS(snap(ctl)); }}>{t('▶ Second half')}</Btn>
              </div>
            </div>
          </div>
        )}

        {done && res && (
          <div className="overlay">
            <div className="card pop" style={{ maxWidth: 540, width: '100%' }}>
              <h2 style={{ textAlign: 'center', fontSize: 26 }}>
                {outcome?.outcome === 'win' ? t('🎉 Victory!') : outcome?.outcome === 'loss' ? t('😢 Defeat') : t('🤝 Draw')}
              </h2>
              <div className="row" style={{ justifyContent: 'center', fontSize: 30, fontWeight: 700, margin: '4px 0' }}>
                {hs.name} {res.score[0]} – {res.score[1]} {as.name}
              </div>
              {fixture.pens && <p style={{ textAlign: 'center', fontWeight: 600 }}>{t('Penalty shoot-out: {a} – {b}', { a: fixture.pens[0], b: fixture.pens[1] })}</p>}
              <StatsPanel engine={e} res={res} />
              {outcome && <div style={{ marginTop: 8 }}>{outcome.lines.map((l, i) => <div key={i} className="chip" style={{ margin: 2 }}>{tx(l)}</div>)}</div>}
              <div className="row" style={{ marginTop: 12, justifyContent: 'center' }}>
                <Btn kind="green" onClick={() => go('dashboard')}>{t('Continue ➜')}</Btn>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="controls">
        <Btn small kind="ghost" onClick={exit}>{t('⬅ Exit')}</Btn>
        {mode !== 'quick' && !done && (
          <>
            <Btn small kind={s.paused ? 'green' : 'ghost'} onClick={togglePause}>{s.paused ? t('▶ Play') : t('⏸ Pause')}</Btn>
            {[1, 2, 4].map((v) => <Btn key={v} small kind={speed === v && cur === 'watch' ? 'blue' : 'ghost'} onClick={() => { setSp(v); ctl.mode = 'watch'; setCur('watch'); }}>{v}x</Btn>)}
            <Btn small kind={cur === 'highlights' ? 'blue' : 'ghost'} onClick={() => { ctl.mode = cur === 'highlights' ? 'watch' : 'highlights'; setCur(ctl.mode); }}>{t('✨ Highlights')}</Btn>
            <Btn small kind="ghost" onClick={() => { const n = cam === 'follow' ? 'wide' : 'follow'; ctl.camMode = n; setCam(n); window.dispatchEvent(new Event('resize')); }}>{cam === 'follow' ? t('🔭 Wide view') : t('🔍 Close view')}</Btn>
            <Btn small kind="ghost" disabled={s.subs[userSide] <= 0} onClick={() => { ctl.paused = true; setSubOpen(true); }}>{t('🔄 Sub ({n})', { n: s.subs[userSide] })}</Btn>
            <Btn small kind="red" onClick={() => { ctl.skipToEnd(); setS(snap(ctl)); }}>{t('⏩ Skip to end')}</Btn>
          </>
        )}
        <span className="hint" style={{ marginLeft: 'auto' }}>{Math.round((e.time / MATCH_SECONDS()) * 100)}%</span>
      </div>

      {subOpen && (
        <Modal title={t('🔄 Substitution')} onClose={() => { setSubOpen(false); setSubOut(null); if (!ht) ctl.paused = false; }}>
          <p className="hint">{subOut === null ? t('1. Choose who goes off') : t('2. Choose who comes on')} · {t('{n} left', { n: s.subs[userSide] })}</p>
          {subOut === null ? (
            field.map((a) => (
              <div key={a.id} className="prow" onClick={() => setSubOut(a.slot)}>
                <PosBadge pos={a.slotPos} /><ShirtNo p={a.player} /><div className="grow"><div className="nm">{a.player.name}</div><div className="sub">{t('Energy {n}%', { n: Math.round(a.energy * 100) })}</div></div><OvrBadge v={a.player.ovr} />
              </div>
            ))
          ) : benchP.length ? (
            benchP.map((p) => (
              <div key={p.id} className="prow" onClick={() => doSub(p.id)}>
                <PosBadge pos={p.pos} /><ShirtNo p={p} /><div className="grow"><div className="nm">{p.name}</div></div><OvrBadge v={p.ovr} />
              </div>
            ))
          ) : <p>{t('No substitutes available.')}</p>}
        </Modal>
      )}
    </div>
  );
}
