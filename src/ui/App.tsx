import { Fragment, Suspense, lazy, useEffect } from 'react';
import { useG, useStore, type Screen } from '../store';
import { Logo, Coins, Stars } from './kit';
import { userClub, userFixture } from '../game/world';
import { CreateClub, Menu, Splash } from './Intro';
import { Dashboard } from './Dashboard';
import { PlayerProfile, Squad, TrainingCenter } from './Squad';
import { Tactics } from './Tactics';
import { Transfers } from './Transfers';
import { League, Schedule } from './Competition';
import { Finance, Settings, Trophies } from './Management';
import { sfx } from '../audio';
import { t } from '../i18n';

const MatchScreen = lazy(() => import('./MatchScreen').then((m) => ({ default: m.MatchScreen })));

const NAV: { s: Screen; i: string; t: string }[] = [
  { s: 'dashboard', i: '🏠', t: 'Home' }, { s: 'squad', i: '👥', t: 'Squad' }, { s: 'tactics', i: '📋', t: 'Tactics' },
  { s: 'match', i: '⚽', t: 'Match' }, { s: 'transfers', i: '💱', t: 'Transfers' }, { s: 'training', i: '🏋️', t: 'Training' },
  { s: 'league', i: '🏆', t: 'League' }, { s: 'schedule', i: '📅', t: 'Schedule' }, { s: 'finance', i: '💰', t: 'Finance' },
  { s: 'trophies', i: '🥇', t: 'Trophies' }, { s: 'settings', i: '⚙️', t: 'Settings' },
];

function Shell() {
  const g = useG();
  const { screen, go, say } = useStore();
  const club = userClub(g);
  const pending = g.offers.length;
  const body = (() => {
    switch (screen) {
      case 'dashboard': return <Dashboard />;
      case 'squad': return <Squad />;
      case 'player': return <PlayerProfile />;
      case 'tactics': return <Tactics />;
      case 'transfers': return <Transfers />;
      case 'training': return <TrainingCenter />;
      case 'league': return <League />;
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
        <span className="pill"><Stars rep={club.rep} /></span>
        <span className="pill">🏆 {g.trophies.length}</span>
        <button className="pill" style={{ border: 0, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => go('menu')}>🏁 Menu</button>
      </div>
      <div className="shell">
        <nav className="nav" aria-label={t('Main navigation')}>
          {NAV.map((n) => (
            <button key={n.s} className={screen === n.s || (screen === 'player' && n.s === 'squad') ? 'on' : ''} onClick={() => {
              if (n.s === 'match') {
                if (!userFixture(g)) { say('No match this week — skip to next week from Home.'); sfx.bad(); go('dashboard'); return; }
                go('match', {});
              } else go(n.s);
            }}>
              <span className="ic">{n.i}</span>{t(n.t)}{n.s === 'transfers' && pending ? <span className="tag red">{pending}</span> : null}
            </button>
          ))}
        </nav>
        <main className="main"><div className="content">{body}</div></main>
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
