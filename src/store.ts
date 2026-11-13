import { create } from 'zustand';
import type { GameState } from './game/types';
import { newGame, SAVE_KEY, ensureContracts, ensureNumbers, fixLineup, openAcademy, type NewClubInput } from './game/world';
import { createRealWorld, type RealStart } from './game/realWorld';
import { applyCatalogue } from './game/catalogue';
import type { ServerPlayer } from './api/server';
import { configureAudio } from './audio';
import { getLang, setLang as applyLang, tx, type Lang } from './i18n';

export type Screen =
  | 'splash' | 'menu' | 'create' | 'dashboard' | 'squad' | 'tactics' | 'match' | 'transfers' | 'player'
  | 'training' | 'league' | 'schedule' | 'finance' | 'trophies' | 'settings' | 'club' | 'academy';

interface Store {
  g: GameState | null;
  v: number;
  screen: Screen;
  params: Record<string, unknown>;
  back: Screen;
  /** Club shown on the club page, and the screen its Back button returns to. */
  viewClub: number;
  clubBack: Screen;
  toast: string | null;
  hasSave: boolean;
  lang: Lang;
  setLang: (l: Lang) => void;
  go: (s: Screen, params?: Record<string, unknown>) => void;
  commit: (fn: (g: GameState) => void) => void;
  /** `real` starts the save at a real club, with the catalogue that was just loaded for it. */
  start: (inp: NewClubInput, real?: { start: RealStart; catalogue: ServerPlayer[] }) => void;
  load: () => boolean;
  /** Install a world loaded from the server as the running game and keep it locally. */
  adopt: (g: GameState) => void;
  saveNow: () => void;
  wipe: () => void;
  say: (msg: string) => void;
}

let saveTimer: number | undefined;
let toastTimer: number | undefined;

function readSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as GameState;
    if (!g || !Array.isArray(g.players) || !g.clubs) return null;
    return g;
  } catch {
    return null;
  }
}

/** Bring a stored world up to the current game version before it is played. */
function prepare(g: GameState) {
  fixLineup(g);
  // saves made before shirt numbers and the academy existed get them here
  ensureNumbers(g);
  ensureContracts(g);
  openAcademy(g);
  configureAudio(g.settings);
}

export const useStore = create<Store>((set, get) => ({
  g: null,
  v: 0,
  screen: 'splash',
  params: {},
  viewClub: -1,
  clubBack: 'league',
  back: 'dashboard',
  toast: null,
  hasSave: !!readSave(),
  lang: getLang(),
  setLang: (l) => {
    applyLang(l);
    set({ lang: l });
  },
  go: (screen, params = {}) =>
    set((s) => ({
      screen,
      params,
      back: s.screen === 'player' ? s.back : s.screen,
      // coming back from a player profile carries no club id, so the page remembers its own
      ...(screen === 'club'
        ? { viewClub: typeof params.id === 'number' ? params.id : s.viewClub, clubBack: s.screen === 'player' || s.screen === 'club' ? s.clubBack : s.screen }
        : {}),
    })),
  commit: (fn) => {
    const g = get().g;
    if (!g) return;
    fn(g);
    set((s) => ({ v: s.v + 1 }));
    configureAudio(g.settings);
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => get().saveNow(), 400);
  },
  start: (inp, real) => {
    const g = real ? newGame(inp, (seed) => createRealWorld(seed, inp, real.start, real.catalogue)) : newGame(inp);
    // the catalogue is already here: bring in the rest of it (the other leagues) and mark the season as loaded
    if (real) applyCatalogue(g, real.catalogue, g.season);
    set({ g, v: 1, screen: 'dashboard', hasSave: true });
    get().saveNow();
  },
  load: () => {
    const g = readSave();
    if (!g) return false;
    prepare(g);
    set({ g, v: 1, screen: 'dashboard' });
    return true;
  },
  adopt: (g) => {
    prepare(g);
    set({ g, v: 1, screen: 'dashboard', hasSave: true });
    get().saveNow();
  },
  saveNow: () => {
    const g = get().g;
    if (!g) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(g));
      set({ hasSave: true });
    } catch {
      get().say('Could not save (storage full).');
    }
  },
  wipe: () => {
    localStorage.removeItem(SAVE_KEY);
    set({ g: null, hasSave: false, screen: 'menu' });
  },
  say: (msg) => {
    window.clearTimeout(toastTimer);
    set({ toast: tx(msg) });
    toastTimer = window.setTimeout(() => set({ toast: null }), 2600);
  },
}));

export function useG(): GameState {
  useStore((s) => s.v);
  return useStore.getState().g!;
}
