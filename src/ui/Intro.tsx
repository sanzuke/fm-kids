import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Btn, Jersey, LangPicker, Logo, Modal, Rich } from './kit';
import { COLORS, ICONS, STADIUMS } from '../game/data';
import { sfx, wantMusic } from '../audio';
import { t } from '../i18n';
import { fetchCatalogueClubs, fetchCataloguePlayers, readable, useServer, type CatalogueClub } from '../api/server';

export function Splash() {
  const go = useStore((s) => s.go);
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setP((x) => Math.min(100, x + 9)), 90);
    return () => clearInterval(t);
  }, []);
  const ready = p >= 100;
  return (
    <div className="splash" onClick={() => ready && (wantMusic(true), sfx.whistle(), go('menu'))} role="button" aria-label={t('Start')}>
      <div className="title-logo">
        Kids Football<small>⚽ M A N A G E R ⚽</small>
      </div>
      {ready ? <div className="tap">{t('Tap to start!')}</div> : <div className="loadbar"><i style={{ width: `${p}%` }} /></div>}
    </div>
  );
}

export function Menu() {
  const { go, load, hasSave, say } = useStore();
  const [how, setHow] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="menu">
      <div className="menu-box fade">
        <div className="title-logo" style={{ animation: 'none' }}>Kids Football<small>MANAGER</small></div>
        {hasSave && <Btn kind="green" onClick={() => !load() && say('Save file could not be loaded.')}>{t('▶ Continue')}</Btn>}
        <Btn onClick={() => (hasSave ? setConfirm(true) : go('create'))}>{t('⭐ New Game')}</Btn>
        <Btn kind="blue" onClick={() => setHow(true)}>{t('❓ How to Play')}</Btn>
        <LangPicker />
      </div>
      {confirm && (
        <Modal title={t('Start a new game?')} onClose={() => setConfirm(false)}>
          <p>{t('Your saved club will be replaced when you create a new one.')}</p>
          <div className="row" style={{ marginTop: 12 }}>
            <Btn kind="red" onClick={() => go('create')}>{t('Yes, new club')}</Btn>
            <Btn kind="ghost" onClick={() => setConfirm(false)}>{t('Keep my save')}</Btn>
          </div>
        </Modal>
      )}
      {how && (
        <Modal title={t('How to play')} onClose={() => setHow(false)}>
          <ol style={{ paddingLeft: 20, lineHeight: 1.6, margin: 0 }}>
            <li><Rich text={t('👥 Check your <b>Squad</b> and set the team in <b>Tactics</b> — drag players around the pitch.')} /></li>
            <li><Rich text={t('⚽ Press <b>Watch match</b> and watch your players run, pass and shoot!')} /></li>
            <li><Rich text={t('🏋️ Use <b>Training</b> to make your players better every week.')} /></li>
            <li><Rich text={t('💱 Earn coins, then buy stars in the <b>Transfer Market</b>.')} /></li>
            <li>{t('🏆 Win the league, the cup and the tournament to become the best club!')}</li>
          </ol>
        </Modal>
      )}
    </div>
  );
}

export function CreateClub() {
  const { go, start } = useStore();
  const [name, setName] = useState('Happy Rockets');
  const [manager, setManager] = useState('Coach');
  const [icon, setIcon] = useState(4);
  const [c1, setC1] = useState(COLORS[0]);
  const [c2, setC2] = useState('#ffffff');
  const [a1, setA1] = useState(COLORS[1]);
  const [a2, setA2] = useState('#ffffff');
  const [stadium, setStadium] = useState(0);
  const Sw = ({ v, set, cur }: { v: string; set: (c: string) => void; cur: string }) => (
    <button className={`sw ${cur === v ? 'on' : ''}`} style={{ background: v }} aria-label={v} onClick={() => { sfx.click(); set(v); }} />
  );
  // starting at a real club: the catalogue's leagues and clubs, when this build has a player database
  const { url } = useServer();
  const { say } = useStore();
  const [real, setReal] = useState(false);
  const [catalogue, setCatalogue] = useState<CatalogueClub[] | null>(null);
  const [league, setLeague] = useState('');
  const [realClub, setRealClub] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    fetchCatalogueClubs().then((list) => alive && setCatalogue(list.filter((c) => !c.is_fictional && c.league))).catch(() => alive && setCatalogue([]));
    return () => { alive = false; };
  }, [url]);
  // a league can be played once enough of its clubs have a squad in the catalogue
  const leagues = [...new Set((catalogue ?? []).map((c) => c.league!))]
    .filter((l) => catalogue!.filter((c) => c.league === l && c.players >= 11).length >= 8)
    .sort((a, b) => a.localeCompare(b));
  const leagueClubs = (catalogue ?? []).filter((c) => c.league === league).sort((a, b) => a.name.localeCompare(b.name));
  const input = () => ({ manager: manager.trim() || 'Coach', name: real ? realClub : name.trim(), icon, color: c1, color2: c2, awayColor: a1, awayColor2: a2, stadium });
  const begin = async () => {
    if (!real) return start(input());
    setLoading(t('Loading real players…'));
    try {
      const players = await fetchCataloguePlayers('real', (done, total) => setLoading(t('Loading real players… {done}/{total}', { done, total: total || '…' })));
      start(input(), { start: { club: realClub, league, leagueClubs: leagueClubs.map((c) => c.name) }, catalogue: players });
    } catch (e) {
      setLoading(null);
      say(readable(e));
    }
  };
  const ok = real ? !!realClub : name.trim().length >= 2;
  return (
    <div className="content" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#4cc9f0,#d8f7d0)' }}>
      <div className="wrap fade">
        <div className="page-title"><div className="pt-icon">🛡️</div><div><h1>{t('Create your club')}</h1><p>{t('Make it yours — name, logo, colours and stadium!')}</p></div></div>
        {leagues.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h3>{t('Which club?')}</h3>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className={`pick stad ${!real ? 'on' : ''}`} onClick={() => { sfx.click(); setReal(false); }}><span style={{ fontSize: 26 }}>🛡️</span>{t('My own club')}</button>
              <button className={`pick stad ${real ? 'on' : ''}`} onClick={() => { sfx.click(); setReal(true); if (!league) setLeague(leagues[0]); }}><span style={{ fontSize: 26 }}>🌍</span>{t('A real club')}</button>
            </div>
            {real && (
              <div className="grid" style={{ gap: 10, marginTop: 10 }}>
                <p className="hint" style={{ margin: 0 }}>{t('Pick a league and a club. You start with its real players and play against the other clubs of that league.')}</p>
                <label className="f">{t('League')}
                  <select value={league} onChange={(e) => { setLeague(e.target.value); setRealClub(''); }}>
                    {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <div><b>{t('Club')}</b><div className="swatches" style={{ marginTop: 6 }}>{leagueClubs.map((c) => (
                  <button key={c.id} className={`pick stad ${realClub === c.name ? 'on' : ''}`} onClick={() => { sfx.click(); setRealClub(c.name); }}>{c.name}<span className="muted">{t('· {n} players', { n: c.players })}</span></button>
                ))}</div></div>
              </div>
            )}
          </div>
        )}
        <div className="grid g2">
          <div className="card">
            <h3>{t('Club')}</h3>
            <div className="grid" style={{ gap: 10 }}>
              <label className="f">{t('Club name')}<input type="text" maxLength={22} value={real ? realClub : name} disabled={real} onChange={(e) => setName(e.target.value)} /></label>
              <label className="f">{t('Manager name')}<input type="text" maxLength={16} value={manager} onChange={(e) => setManager(e.target.value)} /></label>
              <div><b>{t('Logo')}</b><div className="swatches" style={{ marginTop: 6 }}>{ICONS.map((_, i) => (
                <button key={i} className={`pick ${icon === i ? 'on' : ''}`} onClick={() => { sfx.click(); setIcon(i); }}>{ICONS[i]}</button>
              ))}</div></div>
              <div><b>{t('Stadium')}</b><div className="grid" style={{ gap: 6, marginTop: 6 }}>{STADIUMS.map((s, i) => (
                <button key={i} className={`pick stad ${stadium === i ? 'on' : ''}`} onClick={() => { sfx.click(); setStadium(i); }}><span style={{ fontSize: 26 }}>{s.icon}</span>{s.name}<span className="muted">{t('· {n} seats', { n: s.cap.toLocaleString() })}</span></button>
              ))}</div></div>
            </div>
          </div>
          <div className="card">
            <h3>{t('Jerseys')}</h3>
            <div className="row" style={{ justifyContent: 'space-around', margin: '8px 0' }}>
              <div style={{ textAlign: 'center' }}><Jersey color={c1} color2={c2} size={96} /><div><b>{t('Home|kit')}</b></div></div>
              <Logo icon={icon} color={c1} color2={c2} size={80} />
              <div style={{ textAlign: 'center' }}><Jersey color={a1} color2={a2} size={96} away /><div><b>{t('Away|kit')}</b></div></div>
            </div>
            <b>{t('Home colour')}</b><div className="swatches" style={{ margin: '6px 0 10px' }}>{COLORS.map((c) => <Sw key={c} v={c} set={setC1} cur={c1} />)}</div>
            <b>{t('Home stripe')}</b><div className="swatches" style={{ margin: '6px 0 10px' }}>{COLORS.map((c) => <Sw key={c} v={c} set={setC2} cur={c2} />)}</div>
            <b>{t('Away colour')}</b><div className="swatches" style={{ margin: '6px 0 10px' }}>{COLORS.map((c) => <Sw key={c} v={c} set={setA1} cur={a1} />)}</div>
            <b>{t('Away stripe')}</b><div className="swatches" style={{ margin: '6px 0 4px' }}>{COLORS.map((c) => <Sw key={c} v={c} set={setA2} cur={a2} />)}</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'center' }}>
          <Btn kind="ghost" className="big" onClick={() => go('menu')}>{t('⬅ Back')}</Btn>
          <Btn kind="green" className="big" disabled={!ok || !!loading} onClick={() => void begin()}>{loading ?? t('🚀 Start playing!')}</Btn>
        </div>
      </div>
    </div>
  );
}
