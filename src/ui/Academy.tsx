import { useG, useStore } from '../store';
import { Avatar, Bar, Btn, Nationality, OvrBadge, PageTitle, PosBadge } from './kit';
import { ACADEMY_AGE, ACADEMY_MAX, MAX_SQUAD, academyIntakeSize, academyOf, promoteYouth, releaseYouth, userClub, userSquad } from '../game/world';
import { ATTRS, ATTR_ICON } from '../game/types';
import { sfx } from '../audio';
import { t } from '../i18n';

/** The club's young players: they grow here every week until the manager promotes or releases them. */
export function Academy() {
  const g = useG();
  const { go, commit, say } = useStore();
  const club = userClub(g);
  const lvl = g.facilities.youth;
  const kids = academyOf(g).sort((a, b) => b.pot - a.pot || b.ovr - a.ovr);
  const squad = userSquad(g).length;
  const full = squad >= MAX_SQUAD;
  return (
    <div className="wrap fade">
      <PageTitle
        icon="🌱"
        title={t('Youth Academy')}
        sub={t('Level {n} · {a}/{max} players · {k} new kids every season', { n: lvl, a: kids.length, max: ACADEMY_MAX, k: academyIntakeSize(lvl) })}
        right={<Btn onClick={() => go('finance')}>{t('🏗️ Upgrade facility')}</Btn>}
      />
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row">
          <span className="chip">👥 {t('First team: {n}/{max}', { n: squad, max: MAX_SQUAD })}</span>
          <span className="chip">🌱 {t('Academy: {n}/{max}', { n: kids.length, max: ACADEMY_MAX })}</span>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>{t('Academy kids train every week and cost no wage. Promote them when they are ready, or release them to make room. After the season they turn {n} they must leave, so decide before then!', { n: ACADEMY_AGE })}</p>
      </div>
      {kids.length === 0 && <div className="card"><p className="muted">{t('The academy is empty. New kids arrive at the end of every season.')}</p></div>}
      <div className="grid g2">
        {kids.map((p) => (
          <div key={p.id} className="card" style={{ padding: 10 }}>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Avatar p={p} color={club.color} size={52} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b style={{ cursor: 'pointer' }} onClick={() => go('player', { id: p.id })}>{p.name}</b> <PosBadge pos={p.pos} /> <Nationality p={p} />
                <div className="hint">
                  {t('Age {n}', { n: p.age })}
                  {p.age >= ACADEMY_AGE && <span className="tag red" style={{ marginLeft: 6 }}>{t('Last season here')}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}><OvrBadge v={p.ovr} /><div className="hint">POT {p.pot}</div></div>
            </div>
            <div className="row" style={{ marginTop: 6, flexWrap: 'nowrap' }} title={t('Growth towards potential')}>
              <Bar value={p.ovr} max={p.pot} color="var(--green)" /><b>{p.ovr}/{p.pot}</b>
            </div>
            <div className="row" style={{ marginTop: 6, fontSize: 13, fontWeight: 600, justifyContent: 'space-between' }}>
              {ATTRS.map((a) => <span key={a}>{ATTR_ICON[a]}{p[a]}</span>)}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <Btn small kind="green" disabled={full} title={full ? t('Your squad is full.') : undefined} onClick={() => { let err: string | null = null; commit((x) => { err = promoteYouth(x, p.id); }); if (err) { say(err); sfx.bad(); } else { sfx.good(); say(`${p.name} joins the first team!`); } }}>{t('⬆ Promote')}</Btn>
              <Btn small kind="red" onClick={() => { if (!window.confirm(t('Release {name} from the academy?', { name: p.name }))) return; commit((x) => { releaseYouth(x, p.id); }); say(`${p.name} was released.`); }}>{t('👋 Release')}</Btn>
              <Btn small kind="ghost" onClick={() => go('player', { id: p.id })}>{t('Profile')}</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
