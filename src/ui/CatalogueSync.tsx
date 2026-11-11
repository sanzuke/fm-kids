// Keeping this season's real players in the transfer market.
//
// The backend holds the shared catalogue. On the first load of a season (and again when a new
// season starts) the whole real-player catalogue is copied into the save, so every real
// footballer is already in the market at their own club. Nothing is paid for that copy; the
// transfer itself is the ordinary fee-agreement deal.
import { create } from 'zustand';
import { useEffect } from 'react';
import { useG, useStore } from '../store';
import { fetchCataloguePlayers, readable, useServer } from '../api/server';
import { applyCatalogue } from '../game/catalogue';
import { sfx } from '../audio';
import { t } from '../i18n';

interface SyncState {
  busy: boolean;
  loaded: number;
  total: number;
  error: string | null;
}

const useCatalogue = create<SyncState>(() => ({ busy: false, loaded: 0, total: 0, error: null }));

let inFlight: Promise<boolean> | null = null;
/** the season a failed attempt belongs to, so opening a screen again does not hammer the server */
let failed: { season: number; at: number } | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const RETRY_MS = 60_000;

/**
 * Copy the catalogue into the running save. It does nothing when this season is already in the
 * world, unless `force` asks for a fresh copy. Returns true when the world was updated.
 */
export async function syncRealPlayers(force = false): Promise<boolean> {
  if (inFlight) return inFlight;
  const { g, commit, say } = useStore.getState();
  if (!g || !useServer.getState().url) return false;
  if (!force && g.catalogue?.season === g.season) return false;
  if (!force && failed && failed.season === g.season && Date.now() - failed.at < RETRY_MS) return false;
  const season = g.season;

  inFlight = (async () => {
    useCatalogue.setState({ busy: true, loaded: 0, total: 0, error: null });
    try {
      const list = await fetchCataloguePlayers('real', (loaded, total) => useCatalogue.setState({ loaded, total }));
      // the world can move on while the pages are loading (season ends, another save is loaded)
      const live = useStore.getState().g;
      if (!live) return false;
      let result = { added: 0, updated: 0, total: list.length };
      commit((x) => {
        result = applyCatalogue(x, list, live.season);
      });
      failed = null;
      useCatalogue.setState({ busy: false, loaded: list.length, total: list.length });
      sfx.good();
      say(t('{n} real players are in this season’s market.', { n: result.total }));
      return true;
    } catch (e) {
      const message = readable(e);
      failed = { season, at: Date.now() };
      useCatalogue.setState({ busy: false, error: message });
      // nothing to click: try again on its own while the player keeps playing
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (useStore.getState().g) void syncRealPlayers(true);
      }, RETRY_MS);
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Run the season's catalogue copy once the world is playable and the server is connected. */
export function useCatalogueSync() {
  const { url } = useServer();
  const season = useStore((s) => s.g?.season);
  useEffect(() => {
    if (url && season !== undefined) void syncRealPlayers();
    // the season changing is what asks for the new catalogue
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, season]);
}

function ago(ms: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (mins < 1) return t('just now');
  if (mins < 60) return t('{n} minutes ago', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('{n} hours ago', { n: hours });
  return t('{n} days ago', { n: Math.round(hours / 24) });
}

/** The line above the Scouting filters: how this season's real players got here and how fresh they are. */
export function CatalogueStatus() {
  const g = useG();
  const { url } = useServer();
  const { busy, loaded, total, error } = useCatalogue();
  const fresh = g.catalogue?.season === g.season;

  return (
    <div className="card" style={{ marginBottom: 12, background: fresh ? '#f4fff0' : '#fff8e8' }}>
      <b>🌐 {t('Real players')}</b>
      <p className="hint" style={{ margin: '2px 0 0' }}>
        {busy
          ? t('Loading real players… {done}/{total}', { done: loaded, total: total || '…' })
          : !url
            ? t('This build has no player database, so real players are not loaded. The game uses its own players.')
            : error && !fresh
              ? t('Real players could not be loaded yet. The game keeps trying on its own.')
              : fresh
                ? t('{n} real players for Season {season}, updated {when}. New signings and the new season bring them all up to date.', { n: g.catalogue?.players ?? 0, season: g.season, when: ago(g.catalogue?.syncedAt ?? Date.now()) })
                : t('This season’s real players are not in this world yet.')
        }
      </p>
      {error && !fresh && !busy && <p className="hint" style={{ margin: '2px 0 0', fontSize: 11, opacity: 0.7 }}>{t(error)}</p>}
    </div>
  );
}
