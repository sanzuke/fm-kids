import { useEffect, useRef, useState } from 'react';
import { useG, useStore } from '../store';
import { Avatar, Btn, Jersey, OvrBadge, PageTitle, PosBadge, StatusTags } from './kit';
import { FORMATIONS, FORMATION_IDS, autoLineup, fit } from '../game/formations';
import { P, fixLineup, unavailable, userClub, userSquad } from '../game/world';
import type { Mentality, Player, Style } from '../game/types';
import { sfx } from '../audio';
// `t` is the tactics object in this file, so the translate function is imported as `tt`
import { t as tt } from '../i18n';

type Ref = { kind: 'slot'; idx: number } | { kind: 'bench'; id: number };

export function Tactics() {
  const g = useG();
  const { commit, go, say } = useStore();
  const club = userClub(g);
  const [sel, setSel] = useState<Ref | null>(null);
  const [drag, setDrag] = useState<{ ref: Ref; x: number; y: number } | null>(null);
  const [over, setOver] = useState<Ref | null>(null);
  const dragRef = useRef<{ ref: Ref; sx: number; sy: number; moved: boolean } | null>(null);
  const t = g.tactics;
  const slots = FORMATIONS[t.formation];
  const squad = userSquad(g);
  const bench = squad.filter((p) => !t.lineup.includes(p.id)).sort((a, b) => b.ovr - a.ovr);

  useEffect(() => {
    commit((x) => fixLineup(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playerOf = (r: Ref): Player | undefined => (r.kind === 'slot' ? P(g, t.lineup[r.idx]) : P(g, r.id));

  const swap = (a: Ref, b: Ref) => {
    if (a.kind === 'bench' && b.kind === 'bench') return;
    // injured or suspended players cannot be put in the team
    const incoming = a.kind === 'bench' ? P(g, a.id) : b.kind === 'bench' ? P(g, b.id) : undefined;
    if (incoming && unavailable(incoming)) {
      say(`${incoming.name} cannot play right now.`);
      sfx.bad();
      return;
    }
    commit((x) => {
      const l = x.tactics.lineup;
      if (a.kind === 'slot' && b.kind === 'slot') [l[a.idx], l[b.idx]] = [l[b.idx], l[a.idx]];
      else if (a.kind === 'slot' && b.kind === 'bench') l[a.idx] = b.id;
      else if (a.kind === 'bench' && b.kind === 'slot') l[b.idx] = a.id;
      if (!l.includes(x.tactics.captain)) x.tactics.captain = l.map((id) => P(x, id)).sort((p, q) => q.ovr - p.ovr)[0].id;
    });
    sfx.good();
  };

  const hit = (x: number, y: number): Ref | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-ref]') as HTMLElement | null;
    if (!el) return null;
    const [k, v] = el.dataset.ref!.split(':');
    return k === 'slot' ? { kind: 'slot', idx: +v } : { kind: 'bench', id: +v };
  };

  const startDrag = (ref: Ref) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { ref, sx: e.clientX, sy: e.clientY, moved: false };
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) > 8) d.moved = true;
      if (d.moved) {
        setDrag({ ref: d.ref, x: ev.clientX, y: ev.clientY });
        setOver(hit(ev.clientX, ev.clientY));
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setOver(null);
      if (!d) return;
      if (d.moved) {
        const target = hit(ev.clientX, ev.clientY);
        if (target && !(target.kind === d.ref.kind && (target.kind === 'slot' ? target.idx === (d.ref as { idx: number }).idx : target.id === (d.ref as { id: number }).id))) {
          swap(d.ref, target);
          setSel(null);
        }
      } else {
        setSel((cur) => {
          if (cur && JSON.stringify(cur) !== JSON.stringify(d.ref)) {
            swap(cur, d.ref);
            return null;
          }
          return cur && JSON.stringify(cur) === JSON.stringify(d.ref) ? null : d.ref;
        });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const setFormation = (f: typeof t.formation) =>
    commit((x) => {
      const cur = x.tactics.lineup.map((id) => P(x, id));
      x.tactics.formation = f;
      x.tactics.lineup = autoLineup(cur, f);
      sfx.good();
    });

  const selP = sel ? playerOf(sel) : undefined;
  const isSame = (a: Ref | null, b: Ref) => !!a && JSON.stringify(a) === JSON.stringify(b);
  const lineupPlayers = t.lineup.map((id) => P(g, id)).filter(Boolean);
  const teamOvr = Math.round(lineupPlayers.reduce((s, p, i) => s + p.ovr * fit(p, slots[i].pos), 0) / Math.max(1, lineupPlayers.length));

  const renderToken = (idx: number) => {
    const p = P(g, t.lineup[idx]);
    const s = slots[idx];
    if (!p) return null;
    const ref: Ref = { kind: 'slot', idx };
    const off = fit(p, s.pos) < 0.99;
    return (
      <div
        key={idx}
        className={`token ${isSame(sel, ref) ? 'sel' : ''} ${over && isSame(over, ref) ? 'over' : ''}`}
        data-ref={`slot:${idx}`}
        style={{ left: `${3 + s.v * 94}%`, top: `${3 + (1 - s.u) * 94}%`, opacity: drag && isSame(drag.ref, ref) ? 0.35 : 1 }}
        onPointerDown={startDrag(ref)}
      >
        <div className="tok-shirt"><Jersey color={s.pos === 'GK' ? '#22b573' : club.color} color2={club.color2} size={46} /></div>
        <span className="tok-pos"><PosBadge pos={s.pos} /></span>
        {t.captain === p.id && <span className="cap">C</span>}
        <span className="nm">{p.name.split(' ')[0]}</span>
        <span className="nm" style={{ background: off ? '#ff8c1a' : 'rgba(255,255,255,.9)', color: off ? '#fff' : '#1d2b53', marginTop: 1 }}>{Math.round(p.ovr * fit(p, s.pos))}{off ? ` (${p.pos})` : ''}</span>
      </div>
    );
  };

  return (
    <div className="wrap fade">
      <PageTitle icon="📋" title={tt('Formation & Tactics')} sub={tt('Drag players on the pitch (or tap two players to swap them)')} right={<Btn kind="ghost" onClick={() => { commit((x) => { x.tactics.lineup = autoLineup(userSquad(x), x.tactics.formation); fixLineup(x); }); say('Best XI picked!'); }}>{tt('✨ Auto-pick best XI')}</Btn>} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div>
          <div className="pitch-wrap" data-testid="pitch">
            <div className="circle-c" /><div className="box top" /><div className="box bot" />
            {slots.map((_, i) => renderToken(i))}
          </div>
          <p className="hint" style={{ textAlign: 'center', marginTop: 6 }}>{tt('⬆ Your team attacks upward · Team rating')} <b>{teamOvr}</b></p>
        </div>
        <div className="grid">
          <div className="card">
            <h3>{tt('Formation')}</h3>
            <div className="seg">{FORMATION_IDS.map((f) => <button key={f} className={t.formation === f ? 'on' : ''} onClick={() => setFormation(f)}>{f}</button>)}</div>
            <h3 style={{ marginTop: 12 }}>{tt('Attack or defend?')}</h3>
            <div className="seg">
              {([['0', '🛡️ Defend'], ['1', '⚖️ Balanced'], ['2', '⚔️ Attack']] as const).map(([v, l]) => (
                <button key={v} className={t.mentality === +v ? 'on' : ''} onClick={() => commit((x) => { x.tactics.mentality = +v as Mentality; })}>{tt(l)}</button>
              ))}
            </div>
            <h3 style={{ marginTop: 12 }}>{tt('Play style')}</h3>
            <div className="seg">
              {([['short', '🤝 Short passes'], ['long', '🚀 Long balls'], ['counter', '⚡ Counter attack']] as [Style, string][]).map(([v, l]) => (
                <button key={v} className={t.style === v ? 'on' : ''} onClick={() => commit((x) => { x.tactics.style = v; })}>{tt(l)}</button>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>{selP ? selP.name : tt('Selected player')}</h3>
            {selP ? (
              <div className="row">
                <Avatar p={selP} color={club.color} size={50} /><PosBadge pos={selP.pos} /><OvrBadge v={selP.ovr} />
                <Btn small kind="green" disabled={t.captain === selP.id || !t.lineup.includes(selP.id)} onClick={() => commit((x) => { x.tactics.captain = selP.id; say(`${selP.name} is captain!`); })}>{tt('© Captain')}</Btn>
                <Btn small kind="ghost" onClick={() => go('player', { id: selP.id })}>{tt('Profile')}</Btn>
              </div>
            ) : <p className="hint">{tt('Tap a player to select. Tap another to swap places, or drag a bench player onto the pitch.')}</p>}
          </div>
          <div className="card">
            <h3>{tt('Substitutes ({n})', { n: bench.length })}</h3>
            <div className="bench">
              {bench.map((p) => {
                const ref: Ref = { kind: 'bench', id: p.id };
                return (
                  <div key={p.id} data-ref={`bench:${p.id}`} className={`b ${isSame(sel, ref) ? 'sel' : ''} ${over && isSame(over, ref) ? 'over' : ''} ${unavailable(p) ? 'out' : ''}`} onPointerDown={startDrag(ref)}>
                    <Avatar p={p} color={club.color} size={36} /><div><b style={{ fontSize: 14 }}>{p.name.split(' ')[0]}</b><div><PosBadge pos={p.pos} /> <OvrBadge v={p.ovr} /><StatusTags p={p} /></div></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {drag && (() => {
        const p = playerOf(drag.ref);
        return p ? <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}><Jersey color={club.color} color2={club.color2} size={56} /><div className="nm" style={{ background: '#1d2b53', color: '#fff', borderRadius: 8, padding: '1px 6px', fontSize: 12, textAlign: 'center' }}>{p.name.split(' ')[0]}</div></div> : null;
      })()}
    </div>
  );
}
