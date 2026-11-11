import { useG, useStore } from '../store';
import { Avatar, Bar, Btn, Coins, Logo, Nationality, OvrBadge, PageTitle, PosBadge, PosBadges, ShirtNo, Stars, StatusTags } from './kit';
import { P, clubOf, expectedLineup, squadOf, tablePos, teamStats } from '../game/world';
import { POSITIONS } from '../game/types';
import { divName, STADIUMS } from '../game/data';
import { t, tx } from '../i18n';

/** Another club's squad: who they have, who is likely to start, and how strong they are next to you. */
export function ClubPage() {
  const g = useG();
  const { go, viewClub, clubBack } = useStore();
  const club = clubOf(g, viewClub);
  if (!club) return <div className="wrap"><Btn onClick={() => go('league')}>{t('⬅ Back')}</Btn></div>;
  const xi = club.isUser ? g.tactics.lineup : expectedLineup(g, club.id);
  const sq = squadOf(g, club.id).sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || b.ovr - a.ovr);
  const avgOf = (ids: number[]) => Math.round(ids.reduce((s, id) => s + (P(g, id)?.ovr ?? 0), 0) / Math.max(1, ids.length));
  const avg = Math.round(sq.reduce((s, p) => s + p.ovr, 0) / Math.max(1, sq.length));
  const theirs = avgOf(xi);
  const mine = avgOf(g.tactics.lineup);
  const row = teamStats(g, club.id);
  const stars = sq.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  return (
    <div className="wrap fade">
      <PageTitle
        icon="👀"
        title={club.name}
        sub={t('{n} players · avg rating {avg} · tap a player to see their profile', { n: sq.length, avg })}
        right={<Btn kind="ghost" onClick={() => go(clubBack)}>{t('⬅ Back')}</Btn>}
      />
      <div className="grid g2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Logo icon={club.icon} color={club.color} color2={club.color2} size={64} />
            <div className="grow">
              <b>{club.foreign ? t('🌍 Club from abroad') : tx(divName(club.div))}</b>
              {!club.foreign && <div className="hint">{t('Position {pos} of {n}', { pos: tablePos(g, club.id), n: g.tables[club.div]?.length ?? 0 })}</div>}
              <Stars rep={club.rep} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="chip">📋 {t('Formation')} {club.isUser ? g.tactics.formation : club.formation}</span>
            <span className="chip">🏟️ {STADIUMS[club.stadium]?.name}</span>
            {row && <span className="chip">{row.w}-{row.d}-{row.l} · {row.pts} {t('Pts|table')}</span>}
          </div>
        </div>
        <div className="card">
          <h2>{t('Team strength')}</h2>
          <div className="row"><b style={{ width: 70 }}>{t('Them')}</b><Bar value={theirs} color="var(--red)" /><b>{theirs}</b></div>
          <div className="row" style={{ marginTop: 4 }}><b style={{ width: 70 }}>{t('You')}</b><Bar value={mine} color="var(--green)" /><b>{mine}</b></div>
          <h3 style={{ marginTop: 10 }}>{t('⭐ Key players')}</h3>
          {stars.map((p) => (
            <div key={p.id} className="prow" onClick={() => go('player', { id: p.id })}>
              <Avatar p={p} size={34} color={club.color} />
              <div className="grow"><div className="nm">{p.name} <PosBadge pos={p.pos} /></div></div>
              <OvrBadge v={p.ovr} />
            </div>
          ))}
        </div>
      </div>
      <p className="hint" style={{ marginBottom: 6 }}>{t('The eleven marked {tag} are expected to start against you.', { tag: t('XI') })}</p>
      <div className="card scroll-x">
        <table className="t">
          <thead><tr><th>{t('No.|shirt')}</th><th>{t('Player')}</th><th>{t('Nation')}</th><th>{t('Pos')}</th><th>{t('Age')}</th><th>OVR</th><th>⚡</th><th>🎯</th><th>🤝</th><th>🌀</th><th>🛡️</th><th>❤️</th><th>⚽</th><th>🅰️</th><th>{t('Value')}</th></tr></thead>
          <tbody>
            {sq.map((p) => (
              <tr key={p.id} className="click" onClick={() => go('player', { id: p.id })}>
                <td><ShirtNo p={p} /></td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}><Avatar p={p} color={club.color} size={38} /><div><b>{p.name}</b>{xi.includes(p.id) ? <span className="tag green" style={{ marginLeft: 6 }} title={t('Expected to start')}>{t('XI')}</span> : <span className="tag grey" style={{ marginLeft: 6 }} title={t('Substitute')}>{t('SUB')}</span>}<StatusTags p={p} /></div></div></td>
                <td><Nationality p={p} /></td><td><PosBadges p={p} /></td><td>{p.age}</td><td><OvrBadge v={p.ovr} /></td>
                <td>{p.speed}</td><td>{p.shooting}</td><td>{p.passing}</td><td>{p.dribbling}</td><td>{p.defending}</td><td>{p.stamina}</td>
                <td>{p.seasonGoals}</td><td>{p.seasonAssists}</td>
                <td><Coins n={p.value} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
