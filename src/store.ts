import { create } from 'zustand';
import type { GameState } from './game/types';
import { newGame, SAVE_KEY, ensureContracts, ensureNumbers, fixLineup, openAcademy, type NewClubInput } from './game/world';
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
  start: (inp: NewClubInput) => void;
  load: () => boolean;
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
  start: (inp) => {
    const g = newGame(inp);
    set({ g, v: 1, screen: 'dashboard', hasSave: true });
    get().saveNow();
  },
  load: () => {
    const g = readSave();
    if (!g) return false;
    fixLineup(g);
    // saves made before shirt numbers and the academy existed get them here
    ensureNumbers(g);
    ensureContracts(g);
    openAcademy(g);
    configureAudio(g.settings);
    set({ g, v: 1, screen: 'dashboard' });
    return true;
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
