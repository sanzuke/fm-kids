// Optional cloud saves. The catalogue of real players is handled automatically by
// CatalogueSync, so nothing here asks the player for a server or shows a catalogue browser.
import { useEffect, useState } from 'react';
import { useG, useStore } from '../store';
import { Btn } from './kit';
import { checkServer, readable, useServer, type GameSaveSummary, listGameSaves, createCloudSave, updateCloudSave, loadCloudSave, deleteCloudSave } from '../api/server';
import { sfx } from '../audio';
import { t, tx } from '../i18n';

type Mode = 'login' | 'register';

/**
 * Optional sign-in for cloud saves. The backend address belongs to the build, so there is no
 * address field: the player never configures a server, and everything except keeping saves
 * online works without an account.
 */
export function ServerConnect() {
  const { url, token, user, busy, error, signIn, signOut, setError } = useServer();
  const { saveNow, say } = useStore();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  // what the form itself refuses before it is sent; the server's own error is kept apart
  const [formError, setFormError] = useState<string | null>(null);
  // 'checking' until the server's public health check answers; 'down' explains a stopped backend
  const [health, setHealth] = useState<'checking' | 'ok' | 'down'>('checking');

  const probe = async () => {
    if (!url) {
      setHealth('down');
      return;
    }
    setHealth('checking');
    setHealth((await checkServer()) ? 'ok' : 'down');
  };

  useEffect(() => {
    void probe();
    // probe when the card opens or the backend address baked into the build changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (token) {
    return (
      <div className="card">
        <h2>{t('☁️ Cloud account')}</h2>
        <p className="hint">{t('Signed in as {name}. Cloud saves are synced with the game server; real players load on their own and need no account.', { name: user?.email ?? '' })}</p>
        <div className="row" style={{ marginTop: 8 }}>
          <Btn small kind="ghost" onClick={() => { saveNow(); signOut(); say('Signed out.'); }}>{t('Sign out')}</Btn>
        </div>
      </div>
    );
  }

  const submit = async () => {
    setError(null);
    setFormError(null);
    // the button stays enabled so a missing or short field says what is wrong instead of
    // looking like a dead button
    const problem = !email.trim()
      ? t('Fill in your email address.')
      : !/^\S+@\S+\.\S+$/.test(email.trim())
        ? t('That email address does not look right.')
        : password.length < 8
          ? t('The password needs at least 8 characters.')
          : mode === 'register' && !name.trim()
            ? t('Fill in your name.')
            : null;
    if (problem) {
      setFormError(problem);
      sfx.bad();
      return;
    }
    const ok = await signIn(url, mode, mode === 'register' ? { email, password, name } : { email, password });
    if (ok) {
      sfx.good();
      say('Signed in. ☁️');
    } else {
      // a failed attempt may mean the server went away; keep the status line honest
      void probe();
    }
  };

  const message = formError ?? error;

  return (
    <div className="card">
      <h2>{t('☁️ Cloud account')}</h2>
      {!url ? (
        <p className="hint">{t('Cloud saves are not set up in this build. Everything else works offline and the real players still load on their own.')}</p>
      ) : (
        <p className="hint">{t('Signing in is optional: it only keeps saves online. Real players, the transfer market and the rest of the game never ask for an account.')}</p>
      )}
      <div
        className="grid g3"
        style={{ gap: 10, marginTop: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }}
      >
        {mode === 'register' && <label className="f">{t('Your name')}<input type="text" maxLength={40} autoComplete="nickname" value={name} onChange={(e) => { setName(e.target.value); setFormError(null); }} /></label>}
        <label className="f">{t('Email')}<input type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setFormError(null); }} /></label>
        <label className="f">{t('Password')}<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => { setPassword(e.target.value); setFormError(null); }} /></label>
      </div>
      {message && <p style={{ color: 'var(--red)', fontWeight: 700 }}>{tx(message)}</p>}
      {url && health !== 'ok' && (
        <p className="hint" style={{ marginTop: 6 }}>
          {health === 'checking'
            ? t('Checking the game server…')
            : t('The game server is not answering right now, so cloud saves are unavailable. The rest of the game and the real players work as usual.')}
        </p>
      )}
      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <Btn kind="green" disabled={busy || !url} onClick={submit}>
          {busy ? t('Please wait…') : mode === 'login' ? t('Sign in') : t('Create account')}
        </Btn>
        <Btn kind="ghost" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setFormError(null); }}>{mode === 'login' ? t('Create account') : t('Sign in')}</Btn>
        {url && health === 'down' && (
          <Btn small kind="ghost" onClick={() => void probe()}>{t('Try again')}</Btn>
        )}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>{t('Your save stays on this device; only the saves you upload are stored online.')}</p>
    </div>
  );
}

/**
 * Keep whole playthroughs on the server. A cloud save is one game world document in its own
 * row, so a user can hold several and no other user can read them. The shared catalogue is
 * untouched; loading one replaces the local save with that world.
 */
/** The name the player last worked with, so coming back offers to update that save. */
let lastCloudName: string | null = null;

export function CloudSaves() {
  const g = useG();
  const { adopt, saveNow, say } = useStore();
  const { token } = useServer();
  const club = g.clubs[g.userClub];
  const [saves, setSaves] = useState<GameSaveSummary[]>([]);
  const [name, setName] = useState(() => lastCloudName ?? `${club?.name ?? g.manager} · Season ${g.season}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setSaves((await listGameSaves()).filter((s) => s.mode === 'cloud'));
      setError(null);
    } catch (e) {
      setError(readable(e));
    }
  };

  useEffect(() => {
    if (token) void refresh();
    else setSaves([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const keep = async () => {
    const clean = name.trim() || club?.name || 'My career';
    setBusy(true);
    setError(null);
    saveNow(); // the local copy is current before it travels
    try {
      const existing = saves.find((s) => s.name === clean);
      if (existing) await updateCloudSave(existing.id, g);
      else await createCloudSave(clean, g);
      await refresh();
      lastCloudName = clean;
      setName(clean);
      sfx.good();
      say('Saved to the cloud. ☁️');
    } catch (e) {
      setError(readable(e));
      sfx.bad();
    } finally {
      setBusy(false);
    }
  };

  const open = async (s: GameSaveSummary) => {
    if (!window.confirm(t('Load this save? Your current local save will be replaced.'))) return;
    setBusy(true);
    setError(null);
    try {
      adopt(await loadCloudSave(s.id));
      lastCloudName = s.name;
      setName(s.name);
      sfx.good();
      say('Cloud save loaded. ☁️');
    } catch (e) {
      setError(readable(e));
      sfx.bad();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: GameSaveSummary) => {
    if (!window.confirm(t('Delete this cloud save?'))) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCloudSave(s.id);
      await refresh();
      say('Cloud save deleted.');
    } catch (e) {
      setError(readable(e));
      sfx.bad();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>{t('☁️ Cloud saves')}</h2>
      {!token ? (
        <p className="hint">{t('Sign in above to keep saves online.')}</p>
      ) : (
        <>
          <p className="hint">{t('Keep this playthrough on the server. Each save is its own world, and only you can open it.')}</p>
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <label className="f grow" style={{ minWidth: 180 }}>{t('Save name')}
              <input type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <Btn kind="green" disabled={busy} onClick={keep}>{busy ? t('Please wait…') : saves.some((s) => s.name === name.trim()) ? t('Update cloud save') : t('Save to cloud')}</Btn>
          </div>
          {error && <p style={{ color: 'var(--red)', fontWeight: 700 }}>{tx(error)}</p>}
          {saves.length === 0 ? (
            <p className="muted" style={{ marginTop: 8 }}>{t('No cloud saves yet.')}</p>
          ) : (
            <div style={{ marginTop: 10 }}>
              {saves.map((s) => (
                <div key={s.id} className="news" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>☁️</span>
                  <span className="grow" style={{ minWidth: 180 }}>
                    <b>{s.name}</b>{s.club?.name ? ` · ${s.club.name}` : ''}
                    <span className="muted"> · {t('Season {n}', { n: s.season })} · {t('{n} players', { n: s.world?.players ?? 0 })}</span>
                    <div className="hint">{t('Updated {when}', { when: new Date(s.updated_at).toLocaleString() })}</div>
                  </span>
                  <span className="row" style={{ marginLeft: 'auto' }}>
                    <Btn small kind="blue" disabled={busy} onClick={() => open(s)}>{t('Load')}</Btn>
                    <Btn small kind="red" disabled={busy} onClick={() => remove(s)}>{t('Delete')}</Btn>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
