import { useState } from 'react';
import { useG, useStore } from '../store';
import { AttrBars, Avatar, Btn, Coins, LineChart, Modal, Nationality, OvrBadge, PageTitle, PlayerCard, PosBadge, PosBadges, Bar, ShirtNo, StatusTags } from './kit';
import { ACADEMY, MAX_EXTRA_POS, P, renewalFee, renewContract, clubOf, setNumber, shirtOf, intensiveSession, learnablePositions, listForSale, sellNow, setPosTraining, setTraining, unavailable, userClub, userSquad } from '../game/world';
import { POSITIONS, ATTRS, ATTR_ICON, ATTR_LABEL, type Attr, type Player, type Pos } from '../game/types';
import { askPrice } from '../game/world';
import { divName } from '../game/data';
import { t, tx } from '../i18n';
import { sfx } from '../audio';

export function Squad() {
  const g = useG();
  const { go } = useStore();
  const [filter, setFilter] = useState<Pos | 'ALL'>('ALL');
  const [sort, setSort] = useState<'ovr' | 'pos' | 'age' | 'value' | 'num'>('ovr');
  const club = userClub(g);
  let sq = userSquad(g);
  if (filter !== 'ALL') sq = sq.filter((p) => p.pos === filter || (p.extraPos ?? []).includes(filter));
  const order = POSITIONS;
  sq = sq.slice().sort((a, b) => (sort === 'pos' ? order.indexOf(a.pos) - order.indexOf(b.pos) : sort === 'age' ? a.age - b.age : sort === 'value' ? b.value - a.value : sort === 'num' ? (a.num ?? 99) - (b.num ?? 99) : b.ovr - a.ovr));
  return (
    <div className="wrap fade">
      <PageTitle icon="👥" title={t('Squad')} sub={t('{n} players · tap a player to see their profile', { n: userSquad(g).length })} right={<Btn onClick={() => go('tactics')}>{t('📋 Set lineup')}</Btn>} />
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="seg">{(['ALL', ...POSITIONS] as const).map((p) => <button key={p} className={filter === p ? 'on' : ''} onClick={() => setFilter(p)}>{p === 'ALL' ? t('ALL') : p}</button>)}</div>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t('Sort players')}>
          <option value="ovr">{t('Sort: Rating')}</option><option value="pos">{t('Sort: Position')}</option><option value="age">{t('Sort: Age')}</option><option value="value">{t('Sort: Value')}</option><option value="num">{t('Sort: Shirt number')}</option>
        </select>
      </div>
      <div className="card scroll-x">
        <table className="t">
          <thead><tr><th>{t('No.|shirt')}</th><th>{t('Player')}</th><th>{t('Nation')}</th><th>{t('Pos')}</th><th>{t('Age')}</th><th>OVR</th><th>POT</th><th>⚡</th><th>🎯</th><th>🤝</th><th>🌀</th><th>🛡️</th><th>❤️</th><th>{t('Value')}</th><th></th></tr></thead>
          <tbody>
            {sq.map((p) => (
              <tr key={p.id} className="click" onClick={() => go('player', { id: p.id })}>
                <td><ShirtNo p={p} /></td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}><Avatar p={p} color={club.color} size={38} /><div><b>{p.name}</b>{g.tactics.captain === p.id && <span className="tag orange" style={{ marginLeft: 6 }} title={t('Captain')}>C</span>}{p.loan && <span className="tag" style={{ marginLeft: 6 }}>{t('LOAN')}</span>}{p.contract === 1 && <span className="tag orange" style={{ marginLeft: 6 }} title={t('Contract ends this season')}>{t('FINAL')}</span>}{g.tactics.lineup.includes(p.id) ? <span className="tag green" style={{ marginLeft: 6 }} title={t('In the starting eleven')}>{t('XI')}</span> : <span className="tag grey" style={{ marginLeft: 6 }} title={t('Substitute')}>{t('SUB')}</span>}<StatusTags p={p} /></div></div></td>
                <td><Nationality p={p} /></td><td><PosBadges p={p} /></td><td>{p.age}</td><td><OvrBadge v={p.ovr} /></td><td>{p.pot}</td>
                <td>{p.speed}</td><td>{p.shooting}</td><td>{p.passing}</td><td>{p.dribbling}</td><td>{p.defending}</td><td>{p.stamina}</td>
                <td><Coins n={p.value} /></td>
                <td>{p.askPrice ? <span className="tag red">{t('For sale')}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PlayerProfile() {
  const g = useG();
  const { params, go, back, commit, say } = useStore();
  const p = P(g, params.id as number);
  const [sellOpen, setSellOpen] = useState(false);
  const [price, setPrice] = useState(0);
  if (!p) return <div className="wrap"><Btn onClick={() => go('squad')}>{t('Back')}</Btn></div>;
  const mine = p.clubId === g.userClub;
  const club = clubOf(g, p.clubId);
  const avgRating = p.apps ? (p.ratingSum / p.apps).toFixed(1) : '–';
  const gap = p.pot - p.ovr;
  return (
    <div className="wrap fade">
      <PageTitle icon="🧒" title={p.name} sub={`${p.pos} · ${t('age {n}', { n: p.age })} · ${club ? club.name : p.clubId === ACADEMY ? t('Youth academy') : t('Free agent')}${club ? ` (${tx(divName(club.div))})` : ''}`} right={<Btn kind="ghost" onClick={() => go(back === 'player' ? 'squad' : back)}>{t('⬅ Back')}</Btn>} />
      <div className="grid g2">
        <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <PlayerCard p={p} color={club?.color} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="row"><b>{t('Overall')}</b><OvrBadge v={p.ovr} /><b>{t('Potential')}</b><OvrBadge v={p.pot} /></div>
            {unavailable(p) || (p.yellows ?? 0) > 0 ? <div className="row" style={{ marginTop: 6 }}><b>{t('Status')}</b><span><StatusTags p={p} /></span><span className="hint">{(p.injury ?? 0) > 0 ? t('Injured: back in {n} matchdays', { n: p.injury ?? 0 }) : (p.ban ?? 0) > 0 ? t('Suspended for the next match') : ''}</span></div> : null}
            {shirtOf(p) !== undefined && (
              <div className="row" style={{ marginTop: 6 }}>
                <b>{t('Shirt number')}</b><ShirtNo p={p} />
                {mine && (
                  <select value={p.num} aria-label={t('Change shirt number')} onChange={(e) => { const n = +e.target.value; let err: string | null = null; commit((x) => { err = setNumber(x, p.id, n); }); say(err ?? `${p.name} now wears number ${n}.`); }}>
                    {Array.from({ length: 99 }, (_, i) => i + 1).map((n) => {
                      const owner = n === p.num ? undefined : userSquad(g).find((q) => q.num === n);
                      return <option key={n} value={n}>{n}{owner ? ` ⇄ ${owner.name}` : ''}</option>;
                    })}
                  </select>
                )}
              </div>
            )}
            <div className="row" style={{ marginTop: 6 }}><b>{t('Nationality')}</b><Nationality p={p} withName size={20} /></div>
            <div className="row" style={{ marginTop: 6 }}><b>{t('Positions')}</b><PosBadges p={p} />{p.posTraining && <span className="chip">{t('📍 Learning {pos}: {n}%', { pos: p.posTraining, n: Math.floor(p.posProgress ?? 0) })}</span>}</div>
            <p className="hint" style={{ margin: '6px 0' }}>{gap >= 12 ? t('🌟 Big future star!') : gap >= 6 ? t('📈 Will grow nicely.') : gap > 0 ? t('A little room to grow.') : t('Has reached full potential.')}</p>
            <div className="row"><span className="chip">{t('🪙 Value {n}', { n: p.value })}</span><span className="chip">{t('💵 Wage {n}/wk', { n: p.salary })}</span>{mine && p.contract !== undefined && <span className="chip">{t('📝 Contract: {n} seasons left', { n: p.contract })}</span>}</div>
            {mine && p.contract !== undefined && (
              <div className="row" style={{ marginTop: 6 }}>
                <Btn small disabled={g.balance < renewalFee(p)} onClick={() => { let err: string | null = null; commit((x) => { err = renewContract(x, p.id); }); if (err) { say(err); sfx.bad(); } else { say(t('{name} renews their contract for 2 more seasons!', { name: p.name })); sfx.good(); } }}>{t('📝 Renew contract (+2 seasons · {fee} coins)', { fee: renewalFee(p) })}</Btn>
              </div>
            )}
            <div className="row" style={{ marginTop: 6 }}><span className="chip">{t('⚽ {n} goals', { n: p.goals })}</span><span className="chip">{t('🅰️ {n} assists', { n: p.assists })}</span><span className="chip">{t('🎽 {n} games', { n: p.apps })}</span><span className="chip">{t('⭐ {n} avg', { n: avgRating })}</span></div>
          </div>
        </div>
        <div className="card">
          <h2>{t('Skills')}</h2>
          <AttrBars p={p} />
        </div>
        <div className="card">
          <h2>{t('📈 Growth')}</h2>
          <LineChart data={p.ovrHistory.length > 1 ? p.ovrHistory : [p.ovr, p.ovr]} label={t('Overall by season')} />
          <p className="hint">{t('Overall rating at the end of each season.')}</p>
          {mine && (
            <div style={{ marginTop: 8 }}>
              <b>{t('Training focus:')}</b> {p.training ? `${ATTR_ICON[p.training]} ${t(ATTR_LABEL[p.training])}` : t('none')}
              {p.training && <Bar value={p.trainProgress} />}
              <div className="row" style={{ marginTop: 6 }}><Btn small onClick={() => go('training')}>{t('🏋️ Training center')}</Btn></div>
            </div>
          )}
        </div>
        <div className="card">
          <h2>{t('Actions')}</h2>
          <div className="row">
            {mine ? (
              <>
                <Btn kind="green" onClick={() => commit((x) => { x.tactics.captain = p.id; if (!x.tactics.lineup.includes(p.id)) { const i = x.tactics.lineup.findIndex((id) => P(x, id)?.pos === p.pos); if (i >= 0) x.tactics.lineup[i] = p.id; else x.tactics.lineup[x.tactics.lineup.length - 1] = p.id; } say(`${p.name} is the new captain!`); })}>{t('© Make captain')}</Btn>
                {!p.loan && <Btn kind="red" onClick={() => { setPrice(p.askPrice ?? askPrice(p)); setSellOpen(true); }}>{t('💸 Sell')}</Btn>}
              </>
            ) : p.clubId === ACADEMY ? (
              <Btn kind="green" onClick={() => go('academy')}>{t('🌱 Open the academy')}</Btn>
            ) : (
              <Btn kind="green" onClick={() => go('transfers', { focus: p.id })}>{t('💱 Open in transfer market')}</Btn>
            )}
          </div>
        </div>
      </div>
      {sellOpen && (
        <Modal title={t('Sell {name}', { name: p.name })} onClose={() => setSellOpen(false)}>
          <p>{t('Market value:')} <Coins n={p.value} />. {t('Set your asking price — clubs may send offers each week!')}</p>
          <input type="range" min={Math.round(p.value * 0.5)} max={Math.round(p.value * 1.8)} step={10} value={price} onChange={(e) => setPrice(+e.target.value)} />
          <div className="big-num" style={{ textAlign: 'center' }}><Coins n={price} /></div>
          <div className="row" style={{ marginTop: 10 }}>
            <Btn kind="blue" onClick={() => { commit((x) => listForSale(x, p.id, price)); say(`${p.name} is listed for ${price} coins.`); setSellOpen(false); }}>{t('📢 List for sale')}</Btn>
            <Btn kind="red" onClick={() => { const q = Math.round(p.value * 0.7); let err: string | null = null; commit((x) => { err = sellNow(x, p.id, q); }); if (err) say(err); else { say(`Sold ${p.name} for ${q} coins`); setSellOpen(false); go('squad'); } }}>{t('⚡ Quick sell ({n})', { n: Math.round(p.value * 0.7) })}</Btn>
            {p.askPrice && <Btn kind="ghost" onClick={() => { commit((x) => listForSale(x, p.id, null)); setSellOpen(false); }}>{t('Remove listing')}</Btn>}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function TrainingCenter() {
  const g = useG();
  const { go, commit, say } = useStore();
  const [sel, setSel] = useState<Attr | null>(null);
  const sq = userSquad(g).slice().sort((a, b) => a.pos.localeCompare(b.pos) || b.ovr - a.ovr);
  const apply = (p: Player, a: Attr | null) => commit((x) => setTraining(x, p.id, a));
  return (
    <div className="wrap fade">
      <PageTitle icon="🏋️" title={t('Training Center')} sub={t('Facility level {n} · players improve a bit every week', { n: g.facilities.training })} right={<Btn onClick={() => go('finance')}>{t('🏗️ Upgrade facility')}</Btn>} />
      <div className="card" style={{ marginBottom: 14 }}>
        <h2>{t('1. Pick a training type')}</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {ATTRS.map((a) => <button key={a} className={`pick ${sel === a ? 'on' : ''}`} style={{ fontSize: 15, fontWeight: 700 }} onClick={() => setSel(sel === a ? null : a)}><div style={{ fontSize: 30 }}>{ATTR_ICON[a]}</div>{t('{skill} Training', { skill: t(ATTR_LABEL[a]) })}</button>)}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="hint">{t('2. Tap a player below to train {skill}.', { skill: sel ? t(ATTR_LABEL[sel]) : t('that skill') })}</span>
          <Btn small kind="blue" disabled={!sel} onClick={() => { commit((x) => userSquad(x).forEach((p) => setTraining(x, p.id, sel))); say('Whole squad is training!'); }}>{t('Everyone')}</Btn>
          <Btn small kind="ghost" onClick={() => commit((x) => userSquad(x).forEach((p) => setTraining(x, p.id, null)))}>{t('Clear all')}</Btn>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>{t('📍 New position: each player can also learn up to {n} extra positions. Pick one on the player card — positions close to the one they already play are learned faster.', { n: MAX_EXTRA_POS })}</p>
      </div>
      <div className="grid g2">
        {sq.map((p) => (
          <div key={p.id} className="card" style={{ padding: 10 }}>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Avatar p={p} color={userClubColor(g)} size={46} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b style={{ cursor: 'pointer' }} onClick={() => go('player', { id: p.id })}>{p.name}</b> <PosBadges p={p} /> <OvrBadge v={p.ovr} />
                <div className="hint">{t('Age {n}', { n: p.age })} · POT {p.pot}</div>
              </div>
            </div>
            <div className="row" style={{ marginTop: 6, flexWrap: 'nowrap' }}>
              <Btn small kind={sel ? 'green' : 'ghost'} disabled={!sel} onClick={() => apply(p, sel)}>{sel ? `${ATTR_ICON[sel]} ${t('Train')}` : t('Pick type')}</Btn>
              {p.training ? <><span className="chip">{ATTR_ICON[p.training]} {p[p.training]}</span><Bar value={p.trainProgress} label={t('progress')} /><b>{Math.floor(p.trainProgress)}%</b></> : <span className="hint">{t('resting')}</span>}
            </div>
            {p.pos !== 'GK' && (
              <div className="row" style={{ marginTop: 6, flexWrap: 'nowrap' }}>
                {p.posTraining ? (
                  <>
                    <span className="chip">📍 {p.posTraining}</span><Bar value={p.posProgress ?? 0} color="var(--purple)" label={t('progress')} /><b>{Math.floor(p.posProgress ?? 0)}%</b>
                    <Btn small kind="ghost" onClick={() => commit((x) => { setPosTraining(x, p.id, null); })}>{t('Stop')}</Btn>
                  </>
                ) : (p.extraPos ?? []).length >= MAX_EXTRA_POS ? (
                  <span className="hint">{t('📍 Knows the most positions already.')}</span>
                ) : (
                  <select value="" aria-label={t('Learn a new position')} onChange={(e) => { const pos = e.target.value as Pos; let err: string | null = null; commit((x) => { err = setPosTraining(x, p.id, pos); }); say(err ?? `${p.name} starts learning ${pos}!`); }}>
                    <option value="">{t('📍 Learn a new position…')}</option>
                    {learnablePositions(p).map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                )}
              </div>
            )}
            {p.training && (
              <div className="row" style={{ marginTop: 6 }}>
                <Btn small kind="blue" onClick={() => { let m = ''; commit((x) => { m = intensiveSession(x, p.id); }); say(m); }}>{t('💪 Extra session (40🪙)')}</Btn>
                <Btn small kind="ghost" onClick={() => apply(p, null)}>{t('Stop')}</Btn>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
const userClubColor = (g: ReturnType<typeof useG>) => userClub(g).color;
