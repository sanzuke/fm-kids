import { useState } from 'react';
import { useG, useStore } from '../store';
import { Avatar, Btn, Logo, OvrBadge, PageTitle, PosBadge, Tabs } from './kit';
import { clubOf, sortTable, topPlayers, userClub, userFixtures } from '../game/world';
import { divName } from '../game/data';
import type { Fixture, GameState } from '../game/types';
import { t, tx } from '../i18n';

type Tab = 'table' | 'scorers' | 'assists' | 'best' | 'cup' | 'tourn';

const Team = ({ g, id, size = 22 }: { g: GameState; id: number; size?: number }) => {
  const c = clubOf(g, id)!;
  return <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Logo icon={c.icon} color={c.color} color2={c.color2} size={size} />{c.name}</span>;
};

function Bracket({ g, comp }: { g: GameState; comp: 'cup' | 'tournament' }) {
  const fx = g.fixtures.filter((f) => f.comp === comp);
  const rounds = [...new Set(fx.map((f) => f.round))].sort();
  if (!rounds.length) return <p className="muted">{t('Draw not made yet — it starts later this season!')}</p>;
  return (
    <div className="bracket">
      {rounds.map((r) => (
        <div key={r} className="bcol">
          <b>{tx(fx.find((f) => f.round === r)!.label)}</b>
          {fx.filter((f) => f.round === r).map((f) => {
            const hw = f.played && (f.hg > f.ag || (f.hg === f.ag && f.pens && f.pens[0] > f.pens[1]));
            const aw = f.played && !hw;
            return (
              <div key={f.id} className="bm">
                <div className={hw ? 'w' : ''}><span style={{ fontWeight: f.home === g.userClub ? 800 : 600 }}>{clubOf(g, f.home)!.name}</span><b>{f.played ? f.hg : ''}</b></div>
                <div className={aw ? 'w' : ''}><span style={{ fontWeight: f.away === g.userClub ? 800 : 600 }}>{clubOf(g, f.away)!.name}</span><b>{f.played ? f.ag : ''}</b></div>
                {f.pens && <div style={{ fontSize: 12 }}><span>{t('Penalties')}</span><span>{f.pens[0]}–{f.pens[1]}</span></div>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function League() {
  const g = useG();
  const { go } = useStore();
  const club = userClub(g);
  const [tab, setTab] = useState<Tab>('table');
  const [div, setDiv] = useState(club.div);
  const rows = sortTable(g.tables[div] ?? []);
  const lists = { scorers: topPlayers(g, div, 'seasonGoals'), assists: topPlayers(g, div, 'seasonAssists'), best: topPlayers(g, div, 'rating') };
  return (
    <div className="wrap fade">
      <PageTitle icon="🏆" title={t('League & Competition')} sub={t('Season {n} · top 2 go up ⬆️, bottom 2 go down ⬇️', { n: g.season })} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: 'table', label: t('📊 Standings') }, { id: 'scorers', label: t('⚽ Top scorers') }, { id: 'assists', label: t('🅰️ Top assists') },
        { id: 'best', label: t('⭐ Best players') }, { id: 'cup', label: t('🏆 Cup') }, { id: 'tourn', label: t('🥇 Tournament') },
      ]} />
      {['table', 'scorers', 'assists', 'best'].includes(tab) && (
        <div className="seg" style={{ marginBottom: 10 }}>{[0, 1, 2].map((d) => <button key={d} className={div === d ? 'on' : ''} onClick={() => setDiv(d)}>{tx(divName(d))}</button>)}</div>
      )}
      {tab === 'table' && (
        <div className="card scroll-x">
          <table className="t">
            <thead><tr><th>#</th><th>{t('Club')}</th>{['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'].map((h) => <th key={h}>{t(`${h}|table`)}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.club} className={r.club === g.userClub ? 'me' : ''}>
                  <td>{i + 1}{div > 0 && i < 2 ? ' ⬆️' : ''}{div < 2 && i >= rows.length - 2 ? ' ⬇️' : ''}</td>
                  <td><Team g={g} id={r.club} /></td><td>{r.p}</td><td>{r.w}</td><td>{r.d}</td><td>{r.l}</td><td>{r.gf}</td><td>{r.ga}</td><td>{r.gf - r.ga}</td><td><b>{r.pts}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(tab === 'scorers' || tab === 'assists' || tab === 'best') && (
        <div className="card">
          {lists[tab].length === 0 && <p className="muted">{t('No stats yet — play some matches!')}</p>}
          {lists[tab].map((p, i) => (
            <div key={p.id} className="prow" onClick={() => go('player', { id: p.id })}>
              <b style={{ width: 22 }}>{i + 1}</b><Avatar p={p} size={36} color={clubOf(g, p.clubId)?.color} />
              <div className="grow"><div className="nm">{p.name} <PosBadge pos={p.pos} /></div><div className="sub">{clubOf(g, p.clubId)?.name}</div></div>
              <b>{tab === 'scorers' ? `${p.seasonGoals} ⚽` : tab === 'assists' ? `${p.seasonAssists} 🅰️` : `${(p.seasonRating / p.seasonApps).toFixed(2)} ⭐`}</b>
              <OvrBadge v={p.ovr} />
            </div>
          ))}
        </div>
      )}
      {tab === 'cup' && <div className="card"><h2>🏆 {tx('Kids Cup')} {g.cup.winner !== null && <span className="tag green">{t('Winner: {club}', { club: clubOf(g, g.cup.winner)!.name })}</span>}</h2><Bracket g={g} comp="cup" /></div>}
      {tab === 'tourn' && <div className="card"><h2>🥇 {tx('Champions Tournament')} {g.tourn.winner !== null && <span className="tag green">{t('Winner: {club}', { club: clubOf(g, g.tourn.winner)!.name })}</span>}</h2><p className="hint">{t('Top 2 of every league + the most famous clubs play at the end of the season.')}</p><Bracket g={g} comp="tournament" /></div>}
    </div>
  );
}

export function Schedule() {
  const g = useG();
  const { go } = useStore();
  const [opp, setOpp] = useState(() => g.clubs.find((c) => !c.isUser)!.id);
  const [home, setHome] = useState(true);
  const mine = userFixtures(g);
  const played = mine.filter((f) => f.played).reverse();
  const upcoming = mine.filter((f) => !f.played);
  const line = (f: Fixture) => {
    const o = f.home === g.userClub ? f.away : f.home;
    return (
      <div key={f.id} className="news" style={{ alignItems: 'center' }}>
        <span style={{ width: 24 }}>{f.home === g.userClub ? '🏠' : '✈️'}</span>
        <span className="grow"><b>{clubOf(g, o)!.name}</b> <span className="muted">· {tx(f.label)}</span></span>
        {f.played ? <b>{f.hg}–{f.ag}{f.pens ? ` (${f.pens[0]}–${f.pens[1]}p)` : ''}</b> : <span className="tag">{t('Matchday {n}', { n: f.step + 1 })}</span>}
      </div>
    );
  };
  return (
    <div className="wrap fade">
      <PageTitle icon="📅" title={t('Match Schedule')} sub={t('Upcoming games, results and friendlies')} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card"><h2>{t('Upcoming')}</h2>{upcoming.length ? upcoming.slice(0, 12).map(line) : <p className="muted">{t('Season complete.')}</p>}</div>
        <div className="card"><h2>{t('Results')}</h2>{played.length ? played.slice(0, 14).map(line) : <p className="muted">{t('No results yet.')}</p>}</div>
        <div className="card">
          <h2>{t('🤝 Friendly match')}</h2>
          <p className="hint">{t('Practise without risk. Friendlies pay a small reward and do not change the league.')}</p>
          <div className="row" style={{ margin: '8px 0' }}>
            <select value={opp} onChange={(e) => setOpp(+e.target.value)} aria-label={t('Opponent')}>{g.clubs.filter((c) => !c.isUser).map((c) => <option key={c.id} value={c.id}>{c.name} ({tx(divName(c.div))})</option>)}</select>
            <div className="seg"><button className={home ? 'on' : ''} onClick={() => setHome(true)}>{t('🏠 Home')}</button><button className={!home ? 'on' : ''} onClick={() => setHome(false)}>{t('✈️ Away')}</button></div>
          </div>
          <div className="row">
            <Btn kind="green" onClick={() => go('match', { friendly: { opp, home }, mode: 'watch' })}>{t('▶ Watch')}</Btn>
            <Btn kind="ghost" onClick={() => go('match', { friendly: { opp, home }, mode: 'quick' })}>{t('⚡ Quick')}</Btn>
          </div>
          {g.friendlies.slice(0, 4).map((f) => <div key={f.id} className="news"><span>🤝</span><span>{clubOf(g, f.home)!.name} {f.hg}–{f.ag} {clubOf(g, f.away)!.name}</span></div>)}
        </div>
      </div>
    </div>
  );
}
