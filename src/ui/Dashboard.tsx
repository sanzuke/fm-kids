import { useState } from 'react';
import { useG, useStore } from '../store';
import { Bar, Btn, Coins, Logo, PageTitle, Stars, LineChart, Modal, StatusTags } from './kit';
import { clubOf, currentStep, last5, skipStep, tablePos, unavailable, userClub, userFixture, userSquad } from '../game/world';
import { divName, STADIUMS } from '../game/data';
import type { Screen } from '../store';
import { t, tx } from '../i18n';

const QUICK: { s: Screen; i: string; t: string }[] = [
  { s: 'squad', i: '👥', t: 'Squad' }, { s: 'tactics', i: '📋', t: 'Tactics' }, { s: 'training', i: '🏋️', t: 'Training' },
  { s: 'transfers', i: '💱', t: 'Transfers' }, { s: 'league', i: '🏆', t: 'League' }, { s: 'finance', i: '💰', t: 'Finance' },
];

export function Dashboard() {
  const g = useG();
  const { go, commit, say } = useStore();
  const [summaryOpen, setSummaryOpen] = useState(true);
  const club = userClub(g);
  const fx = userFixture(g);
  const step = currentStep(g);
  const opp = fx ? clubOf(g, fx.home === g.userClub ? fx.away : fx.home) : undefined;
  const pos = tablePos(g, g.userClub);
  const form = last5(g);
  const sq = userSquad(g);
  const out = sq.filter(unavailable);
  const avg = Math.round(sq.reduce((s, p) => s + p.ovr, 0) / Math.max(1, sq.length));
  const total = g.wins + g.draws + g.losses;
  const next = g.fixtures.filter((f) => !f.played && (f.home === g.userClub || f.away === g.userClub)).slice(0, 4);
  const sum = g.seasonSummary;
  return (
    <div className="wrap fade">
      <PageTitle icon="🏠" title={club.name} sub={`${t('Season {n}', { n: g.season })} · ${tx(divName(club.div))} · ${step ? tx(step.label) : t('Season over')}`} right={<Logo icon={club.icon} color={club.color} color2={club.color2} size={56} />} />
      <div className="grid g3" style={{ marginBottom: 14 }}>
        <div className="card tile"><small>{t('👥 Players')}</small><span className="big-num">{sq.length}</span></div>
        <div className="card tile"><small>{t('🪙 Club coins')}</small><span className="big-num">{Math.round(g.balance).toLocaleString()}</span></div>
        <div className="card tile"><small>{t('🏁 League position')}</small><span className="big-num">{pos}<small>/{g.tables[club.div]?.length}</small></span></div>
        <div className="card tile"><small>{t('⭐ Reputation')}</small><span className="big-num"><Stars rep={club.rep} /></span><Bar value={club.rep} /></div>
      </div>
      <div className="grid g2">
        <div className="card">
          <h2>{t('⚽ Next match')}</h2>
          {fx && opp ? (
            <>
              <div className="row" style={{ justifyContent: 'space-around', margin: '10px 0' }}>
                <div style={{ textAlign: 'center' }}><Logo icon={clubOf(g, fx.home)!.icon} color={clubOf(g, fx.home)!.color} color2={clubOf(g, fx.home)!.color2} size={64} /><div><b>{clubOf(g, fx.home)!.name}</b></div></div>
                <span style={{ fontSize: 30, fontWeight: 700 }}>VS</span>
                <div style={{ textAlign: 'center' }}><Logo icon={clubOf(g, fx.away)!.icon} color={clubOf(g, fx.away)!.color} color2={clubOf(g, fx.away)!.color2} size={64} /><div><b>{clubOf(g, fx.away)!.name}</b></div></div>
              </div>
              <p className="muted" style={{ textAlign: 'center' }}>{tx(fx.label)} · {fx.home === g.userClub ? t('🏠 Home at {stadium}', { stadium: STADIUMS[club.stadium].name }) : t('✈️ Away')}</p>
              <div className="row" style={{ marginTop: 12, justifyContent: 'center' }}>
                <Btn kind="green" onClick={() => go('match', { mode: 'watch' })}>{t('▶ Watch match')}</Btn>
                <Btn kind="blue" onClick={() => go('match', { mode: 'highlights' })}>{t('✨ Highlights')}</Btn>
                <Btn kind="ghost" onClick={() => go('match', { mode: 'quick' })}>{t('⚡ Quick')}</Btn>
              </div>
            </>
          ) : step ? (
            <>
              <p style={{ margin: '10px 0' }}>{t('No match for you this week — your team rests and trains. 😴')}</p>
              <Btn kind="green" onClick={() => { commit((x) => skipStep(x)); say('Week finished! Check the news.'); }}>{t('⏭ Skip to next week')}</Btn>
            </>
          ) : null}
          {out.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <b>{t('🏥 Cannot play')}</b>
              {out.map((p) => <div key={p.id} className="news" style={{ cursor: 'pointer' }} onClick={() => go('player', { id: p.id })}><span className="grow">{p.name}</span><span><StatusTags p={p} /></span></div>)}
            </div>
          )}
        </div>
        <div className="card">
          <h2>{t('📈 Team form')}</h2>
          <div className="row" style={{ margin: '6px 0' }}>
            {form.length ? form.map((r, i) => <span key={i} className={`wdl ${r}`}>{t(`${r}|form`)}</span>) : <span className="muted">{t('No matches yet — kick off!')}</span>}
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="chip">🏆 {g.wins} {t('W|form')}</span><span className="chip">🤝 {g.draws} {t('D|form')}</span><span className="chip">💔 {g.losses} {t('L|form')}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="row"><b style={{ width: 90 }}>{t('Goals for')}</b><Bar value={g.gf} max={Math.max(10, g.gf, g.ga)} color="var(--green)" /><b>{g.gf}</b></div>
            <div className="row" style={{ marginTop: 4 }}><b style={{ width: 90 }}>{t('Goals against')}</b><Bar value={g.ga} max={Math.max(10, g.gf, g.ga)} color="var(--red)" /><b>{g.ga}</b></div>
            <div className="row" style={{ marginTop: 4 }}><b style={{ width: 90 }}>{t('Team rating')}</b><Bar value={avg} /><b>{avg}</b></div>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>{t('{n} competitive matches played', { n: total })}</p>
        </div>
        <div className="card">
          <h2>{t('📅 Coming up')}</h2>
          {next.length === 0 && <p className="muted">{t('Nothing scheduled.')}</p>}
          {next.map((f) => {
            const o = clubOf(g, f.home === g.userClub ? f.away : f.home)!;
            return <div key={f.id} className="news"><span>{f.home === g.userClub ? '🏠' : '✈️'}</span><span><b>{o.name}</b> <span className="muted">· {tx(f.label)}</span></span></div>;
          })}
          <div style={{ marginTop: 8 }}><Btn small kind="ghost" onClick={() => go('schedule')}>{t('Full schedule')}</Btn></div>
        </div>
        <div className="card">
          <h2>{t('📰 Club news')}</h2>
          {g.news.slice(0, 6).map((n) => <div key={n.id} className="news"><span>{n.kind === 'in' ? '✅' : n.kind === 'out' ? '👋' : n.kind === 'trophy' ? '🏆' : n.kind === 'win' ? '🎉' : n.kind === 'loan' ? '🔁' : '📣'}</span><span>{tx(n.text)}</span></div>)}
        </div>
        <div className="card">
          <h2>{t('💰 Coins history')}</h2>
          <LineChart data={g.balanceHistory.slice(-20)} color="#34c46c" label={t('Balance history')} />
        </div>
        <div className="card">
          <h2>{t('🚪 Go to…')}</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {QUICK.map((q) => <button key={q.s} className="pick" style={{ fontSize: 15, fontWeight: 700 }} onClick={() => go(q.s)}><div style={{ fontSize: 30 }}>{q.i}</div>{t(q.t)}</button>)}
          </div>
        </div>
      </div>
      {sum && summaryOpen && (
        <Modal title={t('Season {n} finished!', { n: sum.season })} onClose={() => { setSummaryOpen(false); commit((x) => { x.seasonSummary = null; }); }}>
          <div style={{ textAlign: 'center', fontSize: 52 }}>{sum.result === 'champion' ? '🏆' : sum.result === 'promoted' ? '⬆️' : sum.result === 'relegated' ? '⬇️' : '⚽'}</div>
          {sum.lines.map((l, i) => <p key={i} style={{ margin: '6px 0', fontWeight: 600 }}>{tx(l)}</p>)}
          <p className="hint">{t('Players got a year older and young stars improved. New season, new chances!')}</p>
          <div style={{ marginTop: 10 }}><Btn kind="green" onClick={() => { setSummaryOpen(false); commit((x) => { x.seasonSummary = null; }); }}>{t("Let's go! 🚀")}</Btn></div>
        </Modal>
      )}
    </div>
  );
}
