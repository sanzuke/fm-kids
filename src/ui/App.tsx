import { Fragment, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useG, useStore, type Screen } from '../store';
import { Logo, Coins, Stars } from './kit';
import { userClub, userFixture } from '../game/world';
import { CreateClub, Menu, Splash } from './Intro';
import { Dashboard } from './Dashboard';
import { PlayerProfile, Squad, TrainingCenter } from './Squad';
import { Tactics } from './Tactics';
import { Transfers } from './Transfers';
import { useCatalogueSync } from './CatalogueSync';
import { League, Schedule } from './Competition';
import { ClubPage } from './Club';
import { Academy } from './Academy';
import { Finance, Settings, Trophies } from './Management';
import { sfx } from '../audio';
import { t } from '../i18n';

const MatchScreen = lazy(() => import('./MatchScreen').then((m) => ({ default: m.MatchScreen })));

// `main` entries stay in the bottom bar on a phone; the rest open from its "More" button
const NAV: { s: Screen; i: string; t: string; main?: boolean }[] = [
  { s: 'dashboard', i: '🏠', t: 'Home', main: true }, { s: 'squad', i: '👥', t: 'Squad', main: true }, { s: 'tactics', i: '📋', t: 'Tactics', main: true },
  { s: 'match', i: '⚽', t: 'Match', main: true }, { s: 'transfers', i: '💱', t: 'Transfers', main: true }, { s: 'training', i: '🏋️', t: 'Training' }, { s: 'academy', i: '🌱', t: 'Academy' },
  { s: 'league', i: '🏆', t: 'League' }, { s: 'schedule', i: '📅', t: 'Schedule' }, { s: 'finance', i: '💰', t: 'Finance' },
  { s: 'trophies', i: '🥇', t: 'Trophies' }, { s: 'settings', i: '⚙️', t: 'Settings' },
];

function Shell() {
  const g = useG();
  const { screen, go, say } = useStore();
  const club = userClub(g);
  const pending = g.offers.length;
  useCatalogueSync();
  const [more, setMore] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  // every screen starts at its top
  useEffect(() => {
    content.current?.scrollTo(0, 0);
    setMore(false);
  }, [screen]);
  const isOn = (s: Screen) => screen === s || (screen === 'player' && s === 'squad') || (screen === 'club' && s === 'league');
  const open = (s: Screen) => {
    setMore(false);
    if (s === 'match') {
      if (!userFixture(g)) { say('No match this week — skip to next week from Home.'); sfx.bad(); go('dashboard'); return; }
      go('match', {});
    } else go(s);
  };
  const body = (() => {
    switch (screen) {
      case 'dashboard': return <Dashboard />;
      case 'squad': return <Squad />;
      case 'player': return <PlayerProfile />;
      case 'tactics': return <Tactics />;
      case 'transfers': return <Transfers />;
      case 'training': return <TrainingCenter />;
      case 'league': return <League />;
      case 'club': return <ClubPage />;
      case 'academy': return <Academy />;
      case 'schedule': return <Schedule />;
      case 'finance': return <Finance />;
      case 'trophies': return <Trophies />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  })();
  return (
    <div className="app">
      <div className="topbar">
        <div className="club-name"><Logo icon={club.icon} color={club.color} color2={club.color2} size={30} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</span></div>
        <div className="grow" />
        <span className="pill"><Coins n={g.balance} /></span>
        <span className="pill wide-only"><Stars rep={club.rep} /></span>
        <span className="pill">🏆 {g.trophies.length}</span>
        <button className="pill" style={{ border: 0, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => go('menu')}>🏁 Menu</button>
      </div>
      <div className="shell">
        <nav className="nav" aria-label={t('Main navigation')}>
          {NAV.map((n) => (
            <button key={n.s} className={`${isOn(n.s) ? 'on' : ''} ${n.main ? '' : 'extra'}`} onClick={() => open(n.s)}>
              <span className="ic">{n.i}</span><span className="lb">{t(n.t)}</span>{n.s === 'transfers' && pending ? <span className="tag red">{pending}</span> : null}
            </button>
          ))}
          <button className={`more-btn ${more || NAV.some((n) => !n.main && isOn(n.s)) ? 'on' : ''}`} aria-expanded={more} onClick={() => setMore((v) => !v)}>
            <span className="ic">☰</span><span className="lb">{t('More')}</span>
          </button>
          {more && (
            <>
              <div className="more-back" onClick={() => setMore(false)} />
              <div className="more-sheet pop">
                {NAV.filter((n) => !n.main).map((n) => (
                  <button key={n.s} className={isOn(n.s) ? 'on' : ''} onClick={() => open(n.s)}><span className="ic">{n.i}</span><span className="lb">{t(n.t)}</span></button>
                ))}
              </div>
            </>
          )}
        </nav>
        <main className="main"><div className="content" ref={content}>{body}</div></main>
      </div>
    </div>
  );
}

export function App() {
  const { screen, g, toast, lang } = useStore();
  useEffect(() => {
    const unlock = () => window.removeEventListener('pointerdown', unlock);
    window.addEventListener('pointerdown', unlock);
    return unlock;
  }, []);
  let view;
  if (screen === 'splash') view = <Splash />;
  else if (screen === 'menu' || !g) view = <Menu />;
  else if (screen === 'create') view = <CreateClub />;
  else if (screen === 'match') view = <Suspense fallback={<div className="splash">{t('Loading match…')}</div>}><MatchScreen /></Suspense>;
  else view = <Shell />;
  if (screen === 'create') view = <CreateClub />;
  return (
    <>
      {/* keyed by language so every screen re-reads its text when the language changes */}
      <Fragment key={lang}>{view}</Fragment>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
