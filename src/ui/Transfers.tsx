import { useMemo, useState } from 'react';
import { useG, useStore } from '../store';
import { AttrBars, Avatar, Btn, Coins, LineChart, Modal, Nationality, OvrBadge, PageTitle, PlayerCard, PosBadge, PosBadges, Rich, Tabs } from './kit';
import { NATIONS, nationOf } from '../game/nations';
import { POSITIONS, type Player, type Pos } from '../game/types';
import {
  P, acceptOffer, askPrice, buyPlayer, canBuy, clubOf, contractDemand, listForSale, loanAccepts, loanFee, loanPlayer, marketList,
  negotiateFee, negotiateWage, rejectOffer, sellNow, userClub, userSquad, MAX_SQUAD, type Neg,
} from '../game/world';
import { sfx } from '../audio';
import { t, tx } from '../i18n';

type Tab = 'market' | 'sell' | 'loans' | 'news';

export function Transfers() {
  const g = useG();
  const { params } = useStore();
  const [tab, setTab] = useState<Tab>('market');
  const [open, setOpen] = useState<number | null>((params.focus as number) ?? null);
  const nOffers = g.offers.length;
  return (
    <div className="wrap fade">
      <PageTitle icon="💱" title={t('Transfer Market')} sub={t('Scout, buy, sell and borrow players')} right={<span className="chip"><Coins n={g.balance} /></span>} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'market', label: t('🔍 Scouting') }, { id: 'sell', label: `${t('💸 Sell')}${nOffers ? ` (${nOffers})` : ''}` }, { id: 'loans', label: t('🔁 Loans') }, { id: 'news', label: t('📰 News') }]} />
      {tab === 'market' && <Market onOpen={setOpen} />}
      {tab === 'sell' && <Sell />}
      {tab === 'loans' && <Loans onOpen={setOpen} />}
      {tab === 'news' && <TNews />}
      {open !== null && <Detail pid={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Market({ onOpen }: { onOpen: (id: number) => void }) {
  const g = useG();
  const [pos, setPos] = useState<Pos | 'ALL'>('ALL');
  const [age, setAge] = useState<[number, number]>([15, 38]);
  const [ovr, setOvr] = useState(0);
  const [pot, setPot] = useState(0);
  const [price, setPrice] = useState(5000);
  const [q, setQ] = useState('');
  const [free, setFree] = useState(false);
  const [nat, setNat] = useState('ALL');
  const [sort, setSort] = useState<'ovr' | 'pot' | 'price' | 'age'>('ovr');
  const list = useMemo(() => {
    let l = marketList(g).filter((p) => !p.loan);
    if (pos !== 'ALL') l = l.filter((p) => p.pos === pos);
    l = l.filter((p) => p.age >= age[0] && p.age <= age[1] && p.ovr >= ovr && p.pot >= pot && (p.clubId === -1 ? 0 : askPrice(p)) <= price);
    if (free) l = l.filter((p) => p.clubId === -1);
    if (nat !== 'ALL') l = l.filter((p) => nationOf(p).code === nat);
    if (q.trim()) l = l.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
    l.sort((a, b) => (sort === 'ovr' ? b.ovr - a.ovr : sort === 'pot' ? b.pot - a.pot : sort === 'age' ? a.age - b.age : askPrice(a) - askPrice(b)));
    return l;
  }, [g, pos, age, ovr, pot, price, q, free, sort, nat]);
  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="grid g3" style={{ gap: 10 }}>
          <label className="f">{t('Position')}<select value={pos} onChange={(e) => setPos(e.target.value as Pos | 'ALL')}><option value="ALL">{t('All positions')}</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="f">{t('Nationality')}<select value={nat} onChange={(e) => setNat(e.target.value)}><option value="ALL">{t('All countries')}</option>{NATIONS.map((n) => <option key={n.code} value={n.code}>{t(n.name)}</option>)}</select></label>
          <label className="f">{t('Search name')}<input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('e.g. Rafa')} /></label>
          <label className="f">{t('Sort by')}<select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="ovr">{t('Overall')}</option><option value="pot">{t('Potential')}</option><option value="price">{t('Price (low first)')}</option><option value="age">{t('Age (young first)')}</option></select></label>
          <label className="f">{t('Age')} {age[0]}–{age[1]}<input type="range" min={15} max={38} value={age[1]} onChange={(e) => setAge([age[0], +e.target.value])} /><input type="range" min={15} max={38} value={age[0]} onChange={(e) => setAge([Math.min(+e.target.value, age[1]), age[1]])} /></label>
          <label className="f">{t('Min overall: {n}', { n: ovr })}<input type="range" min={0} max={85} value={ovr} onChange={(e) => setOvr(+e.target.value)} /></label>
          <label className="f">{t('Min potential: {n}', { n: pot })}<input type="range" min={0} max={95} value={pot} onChange={(e) => setPot(+e.target.value)} /></label>
          <label className="f">{t('Max price: {n}', { n: price >= 5000 ? t('any') : price })}<input type="range" min={0} max={5000} step={50} value={price} onChange={(e) => setPrice(+e.target.value)} /></label>
          <label className="f" style={{ flexDirection: 'row', alignItems: 'center' }}><input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> {t('Free agents only')}</label>
        </div>
      </div>
      <p className="hint" style={{ margin: '0 0 6px' }}>{t('{n} players found', { n: list.length })}{list.length > 60 ? ` ${t('(showing 60)')}` : ''}</p>
      <div className="card scroll-x">
        <table className="t">
          <thead><tr><th>{t('Player')}</th><th>{t('Nation')}</th><th>{t('Pos')}</th><th>{t('Age')}</th><th>OVR</th><th>POT</th><th>{t('Club')}</th><th>{t('Price')}</th></tr></thead>
          <tbody>
            {list.slice(0, 60).map((p) => (
              <tr key={p.id} className="click" onClick={() => onOpen(p.id)}>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}><Avatar p={p} color={clubOf(g, p.clubId)?.color ?? '#9aa7c7'} size={36} /><b>{p.name}</b></div></td>
                <td><Nationality p={p} /></td><td><PosBadges p={p} /></td><td>{p.age}</td><td><OvrBadge v={p.ovr} /></td><td>{p.pot}</td>
                <td>{clubOf(g, p.clubId)?.name ?? <span className="tag green">{t('Free agent')}</span>}</td>
                <td>{p.clubId === -1 ? <span className="tag green">{t('FREE')}</span> : <Coins n={askPrice(p)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Detail({ pid, onClose }: { pid: number; onClose: () => void }) {
  const g = useG();
  const p = P(g, pid);
  const [flow, setFlow] = useState<'none' | 'buy' | 'loan'>('none');
  if (!p) return null;
  const mine = p.clubId === g.userClub;
  const club = clubOf(g, p.clubId);
  if (flow === 'buy') return <BuyFlow p={p} onClose={onClose} />;
  if (flow === 'loan') return <LoanFlow p={p} onClose={onClose} />;
  return (
    <Modal title={p.name} onClose={onClose} wide>
      <div className="grid g2">
        <div style={{ display: 'flex', justifyContent: 'center' }}><PlayerCard p={p} color={club?.color} big /></div>
        <div>
          <div className="row"><PosBadges p={p} /><span className="chip"><Nationality p={p} withName /></span><span className="chip">{t('Age {n}', { n: p.age })}</span><span className="chip">{club ? club.name : t('Free agent')}</span></div>
          <div className="row" style={{ margin: '8px 0' }}><b>OVR</b><OvrBadge v={p.ovr} /><b>POT</b><OvrBadge v={p.pot} /></div>
          <AttrBars p={p} />
          <div className="row" style={{ marginTop: 8 }}>
            <span className="chip">{p.clubId === -1 ? t('🆓 No transfer fee') : <>{t('Price')} <Coins n={askPrice(p)} /></>}</span>
            <span className="chip">{t('💵 {n}/wk', { n: contractDemand(p).wage })}</span>
          </div>
          <LineChart data={p.ovrHistory.length > 1 ? p.ovrHistory : [p.ovr, p.ovr]} label={t('Growth')} height={50} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {!mine && <Btn kind="green" onClick={() => setFlow('buy')}>{p.clubId === -1 ? t('✍️ Sign player') : t('💰 Make offer')}</Btn>}
        {!mine && p.clubId !== -1 && <Btn kind="blue" onClick={() => setFlow('loan')}>{t('🔁 Borrow (loan)')}</Btn>}
        <Btn kind="ghost" onClick={onClose}>{t('Close')}</Btn>
      </div>
    </Modal>
  );
}

function BuyFlow({ p, onClose }: { p: Player; onClose: () => void }) {
  const g = useG();
  const { commit, say } = useStore();
  const ask = askPrice(p);
  const dem = contractDemand(p);
  const free = p.clubId === -1;
  const [step, setStep] = useState<'fee' | 'wage' | 'confirm'>(free ? 'wage' : 'fee');
  const [fee, setFee] = useState(free ? 0 : Math.round((ask * 0.85) / 10) * 10);
  const [wage, setWage] = useState(Math.max(1, Math.round(dem.wage * 0.9)));
  const [round, setRound] = useState(1);
  const [msg, setMsg] = useState<Neg | null>(null);
  const club = clubOf(g, p.clubId);
  const send = () => {
    if (step === 'fee') {
      const r = negotiateFee(p, fee, round);
      setMsg(r);
      setRound(round + 1);
      if (r.status === 'accepted') { sfx.good(); setStep('wage'); setMsg(null); say('Club agreed the fee! Now talk to the player.'); }
      else sfx.bad();
    } else {
      const r = negotiateWage(p, wage, round);
      setMsg(r);
      setRound(round + 1);
      if (r.status === 'accepted') { sfx.good(); setStep('confirm'); setMsg(null); }
      else sfx.bad();
    }
  };
  const err = canBuy(g, p, fee);
  return (
    <Modal title={t('Sign {name}', { name: p.name })} onClose={onClose}>
      <div className="row"><Avatar p={p} color={club?.color} size={50} /><PosBadge pos={p.pos} /><OvrBadge v={p.ovr} /><span className="chip">{club ? club.name : t('Free agent')}</span></div>
      <div className="row" style={{ margin: '8px 0' }}>
        <span className={`tag ${step === 'fee' ? '' : 'green'}`}>{t('1. Transfer fee')}</span><span className={`tag ${step === 'wage' ? '' : step === 'confirm' ? 'green' : 'red'}`}>{t('2. Contract')}</span><span className={`tag ${step === 'confirm' ? '' : 'red'}`}>{t('3. Confirm')}</span>
      </div>
      {step === 'fee' && (
        <>
          <p>{t('Asking price:')} <Coins n={ask} />. {t('Offer less and negotiate — but not too low!')}</p>
          <input type="range" min={Math.round(ask * 0.5 / 10) * 10} max={Math.round(ask * 1.3 / 10) * 10} step={10} value={fee} onChange={(e) => setFee(+e.target.value)} />
          <div className="big-num" style={{ textAlign: 'center' }}><Coins n={fee} /></div>
        </>
      )}
      {step === 'wage' && (
        <>
          <p>{free ? t('Free agent — no fee!') : <>{t('Fee agreed:')} <Coins n={fee} />.</>} <Rich text={t(dem.years > 1 ? 'The player wants about <b>{wage}</b> coins/week for {n} years.' : 'The player wants about <b>{wage}</b> coins/week for {n} year.', { wage: dem.wage, n: dem.years })} /></p>
          <input type="range" min={Math.max(1, Math.round(dem.wage * 0.5))} max={Math.round(dem.wage * 1.6) + 1} value={wage} onChange={(e) => setWage(+e.target.value)} />
          <div className="big-num" style={{ textAlign: 'center' }}>{t('💵 {n} / week', { n: wage })}</div>
        </>
      )}
      {step === 'confirm' && (
        <div className="card" style={{ background: '#f4fff0' }}>
          <h3>{t('Deal summary')}</h3>
          <p>{t('Fee:')} <Coins n={fee} /> · {t('Wage: {n}/wk', { n: wage })} · {t('Contract: {n} yr', { n: dem.years })}</p>
          <p>{t('Balance after:')} <Coins n={g.balance - fee} /> · {t('Squad')}: {userSquad(g).length + 1}/{MAX_SQUAD}</p>
          {err && <p style={{ color: 'var(--red)', fontWeight: 700 }}>{tx(err)}</p>}
        </div>
      )}
      {msg && (
        <div className={`card ${msg.status === 'rejected' ? 'shake' : ''}`} style={{ marginTop: 8, background: msg.status === 'rejected' ? '#ffe3e3' : '#fff5c7' }}>
          <p><b>{tx(msg.msg)}</b></p>
          {msg.status === 'counter' && (
            <div className="row" style={{ marginTop: 6 }}>
              <Btn small kind="green" onClick={() => { if (step === 'fee') { setFee(msg.counter!); setStep('wage'); } else { setWage(msg.counter!); setStep('confirm'); } setMsg(null); }}>{t('Accept {n}', { n: msg.counter ?? 0 })}</Btn>
              <span className="hint">{t('or change your offer and try again')}</span>
            </div>
          )}
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        {step !== 'confirm' ? (
          <Btn kind="green" disabled={msg?.status === 'rejected' && round > 3} onClick={send}>{t('📨 Send offer')}</Btn>
        ) : (
          <Btn kind="green" disabled={!!err} onClick={() => { let e: string | null = null; commit((x) => { e = buyPlayer(x, p.id, fee, wage); }); if (e) say(e); else { sfx.coin(); say(`Welcome, ${p.name}! 🎉`); onClose(); } }}>{t('✅ Confirm transfer')}</Btn>
        )}
        <Btn kind="ghost" onClick={onClose}>{t('Cancel')}</Btn>
      </div>
    </Modal>
  );
}

function LoanFlow({ p, onClose }: { p: Player; onClose: () => void }) {
  const g = useG();
  const { commit, say } = useStore();
  const [weeks, setWeeks] = useState(8);
  const [share, setShare] = useState(60);
  const fee = loanFee(p);
  const left = g.steps.length - 1 - g.step;
  const ok = loanAccepts(p, share);
  return (
    <Modal title={t('Borrow {name}', { name: p.name })} onClose={onClose}>
      <p>{t('Loan fee')} <Coins n={fee} /> · <Rich text={t('His wage is <b>{n}</b>/wk.', { n: p.salary })} /></p>
      <label className="f">{t('Loan length: {n} matchdays (max {max})', { n: weeks, max: left })}<input type="range" min={3} max={Math.max(3, left)} value={Math.min(weeks, Math.max(3, left))} onChange={(e) => setWeeks(+e.target.value)} /></label>
      <label className="f" style={{ marginTop: 8 }}>{t('You pay {share}% of his wage ({n}/wk)', { share, n: Math.round((p.salary * share) / 100) })}<input type="range" min={30} max={100} step={5} value={share} onChange={(e) => setShare(+e.target.value)} /></label>
      <p className="hint" style={{ marginTop: 6 }}>{ok ? t('👍 The club will probably say yes.') : t('🤔 The club wants you to pay more of his wage.')}</p>
      <div className="row" style={{ marginTop: 10 }}>
        <Btn kind="green" onClick={() => { let e: string | null = null; commit((x) => { e = loanPlayer(x, p.id, weeks, share); }); if (e) { say(e); sfx.bad(); } else { say(`${p.name} joins on loan!`); sfx.good(); onClose(); } }}>{t('🔁 Request loan')}</Btn>
        <Btn kind="ghost" onClick={onClose}>{t('Cancel')}</Btn>
      </div>
    </Modal>
  );
}

/** The three things a player's market value is worked out from: overall, potential and age. */
function ValueFacts({ p }: { p: Player }) {
  return (
    <div className="row" style={{ gap: 6, margin: '3px 0' }} title={t('Market value comes from overall, potential and age.')}>
      <span className="chip">OVR <OvrBadge v={p.ovr} /></span>
      <span className="chip">POT <OvrBadge v={p.pot} /></span>
      <span className="chip">{t('Age {n}', { n: p.age })}</span>
    </div>
  );
}

function Sell() {
  const g = useG();
  const { commit, say, go } = useStore();
  const sq = userSquad(g).filter((p) => !p.loan).sort((a, b) => b.value - a.value);
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div className="card">
        <h2>{t('📬 Offers for your players')}</h2>
        {g.offers.length === 0 && <p className="muted">{t('No offers right now. List a player for sale and check again next week!')}</p>}
        {g.offers.map((o) => {
          const p = P(g, o.playerId);
          return (
            <div key={o.id} className="prow" style={{ cursor: 'default' }}>
              <Avatar p={p} color={userClub(g).color} size={40} />
              <div className="grow"><div className="nm">{p.name} <PosBadge pos={p.pos} /></div><ValueFacts p={p} /><div className="sub">{t('{club} offers', { club: clubOf(g, o.from)?.name ?? '' })} <Coins n={o.amount} /> {t('(value {n})', { n: p.value })}</div></div>
              <Btn small kind="green" onClick={() => { let e: string | null = null; commit((x) => { e = acceptOffer(x, o.id); }); if (e) say(e); else { sfx.coin(); say(`Sold ${p.name}!`); } }}>{t('Accept')}</Btn>
              <Btn small kind="red" onClick={() => commit((x) => rejectOffer(x, o.id))}>{t('No')}</Btn>
            </div>
          );
        })}
      </div>
      <div className="card">
        <h2>{t('Your players')}</h2>
        <p className="hint">{t('List a player to attract bids, or sell right now at 70% of value.')}</p>
        <p className="hint">{t('💡 Value comes from overall (OVR), potential (POT) and age. Young players with high POT are worth keeping!')}</p>
        {sq.map((p) => (
          <div key={p.id} className="prow" style={{ cursor: 'default' }}>
            <Avatar p={p} color={userClub(g).color} size={36} />
            <div className="grow" onClick={() => go('player', { id: p.id })} style={{ cursor: 'pointer' }}><div className="nm">{p.name} <PosBadges p={p} /></div><ValueFacts p={p} /><div className="sub">{t('Value {n}', { n: p.value })}{p.askPrice ? ` · ${t('asking {n}', { n: p.askPrice })}` : ''}</div></div>
            {p.askPrice ? <Btn small kind="ghost" onClick={() => commit((x) => listForSale(x, p.id, null))}>{t('Unlist')}</Btn> : <Btn small kind="blue" onClick={() => { commit((x) => listForSale(x, p.id, Math.round((p.value * 1.1) / 10) * 10)); say(`${p.name} listed for ${Math.round((p.value * 1.1) / 10) * 10}`); }}>{t('List')}</Btn>}
            <Btn small kind="red" onClick={() => { const q = Math.round(p.value * 0.7); let e: string | null = null; commit((x) => { e = sellNow(x, p.id, q); }); if (e) say(e); else { sfx.coin(); say(`Sold ${p.name} for ${q}`); } }}>{t('Sell')}</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

function Loans({ onOpen }: { onOpen: (id: number) => void }) {
  const g = useG();
  const loans = userSquad(g).filter((p) => p.loan);
  return (
    <div className="card">
      <h2>{t('🔁 Players on loan to you')}</h2>
      {loans.length === 0 && <p className="muted">{t('None yet. Open any player in the Scouting tab and press “Borrow (loan)”.')}</p>}
      {loans.map((p) => (
        <div key={p.id} className="prow" onClick={() => onOpen(p.id)}>
          <Avatar p={p} size={40} color={userClub(g).color} />
          <div className="grow"><div className="nm">{p.name} <PosBadge pos={p.pos} /> <OvrBadge v={p.ovr} /></div><div className="sub">{t('From {club} · returns in {n} matchdays · you pay {share}% wage', { club: clubOf(g, p.loan!.from)?.name ?? '', n: Math.max(0, p.loan!.untilStep - g.step), share: p.loan!.share })}</div></div>
        </div>
      ))}
    </div>
  );
}

function TNews() {
  const g = useG();
  const items = g.news.filter((n) => ['in', 'out', 'loan', 'info'].includes(n.kind));
  return (
    <div className="card">
      <h2>{t('📰 Transfer news')}</h2>
      {items.slice(0, 30).map((n) => <div key={n.id} className="news"><span>{n.kind === 'in' ? '✅' : n.kind === 'out' ? '👋' : n.kind === 'loan' ? '🔁' : '📣'}</span><span>{tx(n.text)}</span></div>)}
    </div>
  );
}
