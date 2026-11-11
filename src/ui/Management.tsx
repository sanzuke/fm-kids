import { useG, useStore } from '../store';
import { Bar, Btn, Coins, LangPicker, LineChart, PageTitle, PlayerCard, Stars, Logo } from './kit';
import { KIT_PATTERNS, ACHIEVEMENTS, buyKit, facilityCost, kitPrice, upgradeFacility, userClub, userSquad, wearKit } from '../game/world';
import { rarity } from '../game/data';
import { configureAudio, sfx, wantMusic } from '../audio';
import { Jersey } from './kit';
import { t, tx } from '../i18n';
import { CloudSaves, ServerConnect } from './Online';

const FAC: { k: 'training' | 'stadium' | 'youth'; icon: string; name: string; desc: string }[] = [
  { k: 'training', icon: '🏋️', name: 'Training ground', desc: 'Players improve faster every week.' },
  { k: 'stadium', icon: '🏟️', name: 'Stadium', desc: 'More fans = bigger ticket sales.' },
  { k: 'youth', icon: '🌱', name: 'Youth academy', desc: 'Better young talents every season.' },
];

export function Finance() {
  const g = useG();
  const { commit, say } = useStore();
  const club = userClub(g);
  const sq = userSquad(g);
  const wages = sq.reduce((s, p) => s + (p.loan ? Math.round(p.salary * (p.loan.share / 100)) : p.salary), 0);
  const sponsor = Math.round(30 + club.rep * 3);
  const upkeep = 8 * (g.facilities.training + g.facilities.stadium + g.facilities.youth);
  return (
    <div className="wrap fade">
      <PageTitle icon="💰" title={t('Club Finance')} sub={t('Earn coins by winning, then invest wisely!')} right={<span className="chip big-num" style={{ fontSize: 22 }}><Coins n={g.balance} /></span>} />
      <div className="grid g2">
        <div className="card">
          <h2>{t('Every week')}</h2>
          <div className="news"><span>➕</span><span className="grow">{t('Sponsors')}</span><b style={{ color: 'var(--green-d)' }}>+{sponsor}</b></div>
          <div className="news"><span>➖</span><span className="grow">{t('Player wages')}</span><b style={{ color: 'var(--red)' }}>-{wages}</b></div>
          <div className="news"><span>➖</span><span className="grow">{t('Facility upkeep')}</span><b style={{ color: 'var(--red)' }}>-{upkeep}</b></div>
          <div className="news"><span>🎟️</span><span className="grow">{t('Home games bring ticket sales & win bonuses')}</span></div>
          <h3 style={{ marginTop: 10 }}>{t('Balance history')}</h3>
          <LineChart data={g.balanceHistory.slice(-24)} color="#34c46c" label={t('Balance')} />
        </div>
        <div className="card">
          <h2>{t('🏗️ Facilities')}</h2>
          {FAC.map((f) => {
            const lvl = g.facilities[f.k];
            const cost = facilityCost(lvl);
            return (
              <div key={f.k} style={{ margin: '8px 0' }}>
                <div className="row"><span style={{ fontSize: 28 }}>{f.icon}</span><div className="grow"><b>{t(f.name)}</b> <span className="chip">{t('Level {n}/5', { n: lvl })}</span><div className="hint">{t(f.desc)}</div></div></div>
                <div className="row" style={{ marginTop: 4 }}>
                  <Bar value={lvl} max={5} color="var(--purple)" />
                  <Btn small kind="green" disabled={lvl >= 5 || g.balance < cost} onClick={() => { let e: string | null = null; commit((x) => { e = upgradeFacility(x, f.k); }); if (e) say(e); else { sfx.coin(); say(`${f.name} upgraded!`); } }}>{lvl >= 5 ? t('MAX') : <>⬆ <Coins n={cost} /></>}</Btn>
                </div>
              </div>
            );
          })}
        </div>
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>{t('🧾 Recent transactions')}</h2>
          {g.txns.slice(0, 14).map((n, i) => <div key={i} className="news"><span>{n.amount >= 0 ? '🟢' : '🔴'}</span><span className="grow">{tx(n.text)}</span><b style={{ color: n.amount >= 0 ? 'var(--green-d)' : 'var(--red)' }}>{n.amount >= 0 ? '+' : ''}{n.amount}</b></div>)}
          {g.txns.length === 0 && <p className="muted">{t('No transactions yet.')}</p>}
        </div>
      </div>
    </div>
  );
}

/** Buy and wear kit patterns with coins. */
function KitShop() {
  const g = useG();
  const { commit, say } = useStore();
  const owned = g.kitOwned ?? [0];
  const wearing = userClub(g).kitPattern ?? 0;
  return (
    <div className="card">
      <h2>{t('👕 Kit Shop')}</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        {KIT_PATTERNS.map((name, i) => (
          <div key={i} className="card" style={{ padding: 8, textAlign: 'center' }}>
            <Jersey color={userClub(g).color} color2={userClub(g).color2} size={64} pattern={i} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>{t(name)}</div>
            {owned.includes(i) ? (
              <Btn small kind={wearing === i ? 'green' : 'ghost'} disabled={wearing === i} onClick={() => { let e: string | null = null; commit((x) => { e = wearKit(x, i); }); if (e) say(e); else say(t('Wearing the {n} kit!', { n: t(name) })); }}>{wearing === i ? t('Wearing') : t('Wear')}</Btn>
            ) : (
              <Btn small disabled={g.balance < kitPrice(i)} onClick={() => { let e: string | null = null; commit((x) => { e = buyKit(x, i); }); if (e) { say(e); sfx.bad(); } else { say(t('{n} kit bought!', { n: t(name) })); sfx.good(); } }}>{t('🪙 {n}', { n: kitPrice(i) })}</Btn>
            )}
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>{t('Kits you buy are worn in matches and on every card and jersey.')}</p>
    </div>
  );
}

export function Trophies() {
  const g = useG();
  const club = userClub(g);
  const owned = g.cards.map((id) => g.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const counts = { bronze: 0, silver: 0, gold: 0, diamond: 0 };
  owned.forEach((p) => counts[rarity(p.ovr)]++);
  const done = Object.keys(g.achievements).filter((k) => ACHIEVEMENTS.some((a) => a.id === k)).length;
  return (
    <div className="wrap fade">
      <PageTitle icon="🥇" title={t('Trophy Room')} sub={t('{n} trophies · {done}/{all} achievements', { n: g.trophies.length, done, all: ACHIEVEMENTS.length })} right={<Logo icon={club.icon} color={club.color} color2={club.color2} size={52} />} />
      <div className="grid g2">
        <KitShop />
        <div className="card">
          <h2>{t('🏆 Trophies')}</h2>
          {g.trophies.length === 0 && <p className="muted">{t('The cabinet is empty… for now! Win the league, cup or tournament.')}</p>}
          <div className="row">{g.trophies.map((tr, i) => <div key={i} className="card pop" style={{ textAlign: 'center', padding: 10, background: '#fff5c7' }}><div style={{ fontSize: 44 }}>{tr.icon}</div><b>{tx(tr.name)}</b><div className="hint">{t('Season {n}', { n: tr.season })}</div></div>)}</div>
          <h3 style={{ marginTop: 12 }}>{t('⭐ Club reputation')}</h3>
          <div className="row"><Stars rep={club.rep} /><Bar value={club.rep} /><b>{Math.round(club.rep)}</b></div>
        </div>
        <div className="card">
          <h2>{t('🎖️ Achievements')}</h2>
          {ACHIEVEMENTS.map((a) => {
            const got = g.achievements[a.id] !== undefined;
            return <div key={a.id} className="news" style={{ opacity: got ? 1 : 0.5 }}><span style={{ fontSize: 24, filter: got ? 'none' : 'grayscale(1)' }}>{a.icon}</span><span className="grow"><b>{tx(a.title)}</b><div className="hint">{tx(a.desc)}</div></span>{got && <span className="tag green">{t('Season {n}', { n: g.achievements[a.id] })}</span>}</div>;
          })}
        </div>
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>{t('🃏 Player cards ({n})', { n: owned.length })}</h2>
          <div className="row" style={{ marginBottom: 8 }}>{(['diamond', 'gold', 'silver', 'bronze'] as const).map((r) => <span key={r} className={`chip r-${r}`}>{t(r)}: {counts[r]}</span>)}</div>
          <p className="hint">{t('Every player who ever joined your club becomes a collectible card. No packs, no gambling — just earn them by playing!')}</p>
          <div className="cards-grid" style={{ marginTop: 8 }}>{owned.map((p) => <PlayerCard key={p.id} p={p} color={club.color} mini />)}</div>
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  const g = useG();
  const { commit, saveNow, wipe, say } = useStore();
  const s = g.settings;
  const set = (patch: Partial<typeof s>) => commit((x) => { Object.assign(x.settings, patch); });
  return (
    <div className="wrap fade">
      <PageTitle icon="⚙️" title={t('Settings')} />
      <div className="grid g2">
        <div className="card">
          <h2>{t('🌐 Language')}</h2>
          <p className="hint" style={{ marginBottom: 6 }}>{t('Choose the language of the game.')}</p>
          <LangPicker />
        </div>
        <div className="card">
          <h2>{t('🔊 Sound')}</h2>
          <div className="row" style={{ margin: '6px 0' }}>
            <Btn kind={s.sound ? 'green' : 'ghost'} onClick={() => { set({ sound: !s.sound }); if (!s.sound) setTimeout(sfx.good, 50); }}>{s.sound ? t('🔊 Effects on') : t('🔇 Effects off')}</Btn>
            <Btn kind={s.music ? 'green' : 'ghost'} onClick={() => { set({ music: !s.music }); wantMusic(!s.music); }}>{s.music ? t('🎵 Music on') : t('🎵 Music off')}</Btn>
          </div>
          <label className="f">{t('Volume {n}%', { n: Math.round(s.volume * 100) })}<input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => { set({ volume: +e.target.value }); configureAudio({ ...s, volume: +e.target.value }); }} /></label>
        </div>
        <div className="card">
          <h2>{t('⚽ Match')}</h2>
          <p className="hint">{t('Default way to play matches')}</p>
          <div className="seg" style={{ marginTop: 6 }}>
            {([['watch', '▶ Watch'], ['highlights', '✨ Highlights'], ['quick', '⚡ Quick']] as const).map(([v, l]) => <button key={v} className={s.defaultMode === v ? 'on' : ''} onClick={() => set({ defaultMode: v })}>{t(l)}</button>)}
          </div>
        </div>
        <div className="card">
          <h2>{t('💾 Save')}</h2>
          <p className="hint">{t('Your game saves automatically on this device.')}</p>
          <div className="row" style={{ marginTop: 8 }}>
            <Btn kind="green" onClick={() => { saveNow(); say('Game saved! 💾'); }}>{t('💾 Save now')}</Btn>
            <Btn kind="red" onClick={() => { if (window.confirm(t('Delete your club and start over?'))) wipe(); }}>{t('🗑️ Delete save')}</Btn>
          </div>
        </div>
        <div className="card">
          <h2>{t('Manager')}</h2>
          <label className="f">{t('Your name')}<input type="text" maxLength={16} value={g.manager} onChange={(e) => commit((x) => { x.manager = e.target.value; })} /></label>
          <p className="hint" style={{ marginTop: 8 }}>{t('Kids Football Manager · invented and real players side by side.')}</p>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <ServerConnect />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <CloudSaves />
        </div>
      </div>
    </div>
  );
}
