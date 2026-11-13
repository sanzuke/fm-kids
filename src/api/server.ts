// Optional connection to the Kids Football Manager backend (backend/, Laravel + PostgreSQL).
// The game itself stays offline; this client only adds the server's player catalogue and
// signing flow. A server account is needed because the catalogue is not public.
//
// Endpoints and payloads are documented in backend/docs/API.md.
import { create } from 'zustand';
import type { Attr, GameState, Pos } from '../game/types';

/** One catalogue player as the server sends it. Both real and fictional players look like this. */
export interface ServerPlayer {
  id: number;
  name: string;
  origin: 'real' | 'fictional';
  age: number;
  nationality: { code: string; name: string } | null;
  club: { id: number; name: string } | null;
  position: Pos;
  secondary_positions: Pos[];
  preferred_foot: string | null;
  personality: string | null;
  height_cm: number | null;
  overall: number;
  potential: number;
  attributes: Record<Attr, number>;
  market_value: number;
  wage: number;
  photo: string | null;
}

export interface PlayerQuery {
  search?: string;
  position?: Pos | 'ALL';
  /** 'ALL' when every origin is welcome. */
  origin?: 'real' | 'fictional' | 'ALL';
  minAge?: number;
  maxAge?: number;
  minRating?: number;
  maxPrice?: number;
  sort?: 'overall' | 'potential' | 'price' | 'age' | 'name';
  page?: number;
  perPage?: number;
}

export interface PlayerPage {
  items: ServerPlayer[];
  total: number;
  page: number;
  lastPage: number;
}

/** A failed call: the server answered with an error, or could not be reached. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const SAVED_KEY = 'kfm-server';

/** Read through import.meta.env without requiring Vite (the build and plain Node both work). */
const env = (import.meta as unknown as { env?: { DEV?: boolean; VITE_API_URL?: string } }).env ?? {};

/**
 * The backend address comes from the build, never from storage or the player.
 *
 * - `VITE_API_URL` bakes the address into a published build.
 * - Without it, the dev preview asks its own dev server, which forwards `kfm/api` to the
 *   backend (see vite.config.ts). The address is relative to the page, so it works wherever
 *   the preview is opened from: localhost, another device, or an HTTPS tunnel.
 * - A published build with neither has no online features; the Scouting banner says so.
 */
function defaultUrl(): string {
  const fromEnv = env.VITE_API_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return normalizeUrl(fromEnv);
  if (!env.DEV) return '';
  if (typeof document === 'undefined') return 'http://localhost:8000/api';
  return new URL('kfm/api', document.baseURI).href;
}

/** Accept "localhost:8000", "http://host/api/" and friends and turn them into a base URL. */
export function normalizeUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url);
    url = `${local ? 'http' : 'https'}://${url}`;
  }
  if (!/\/api$/i.test(url)) url = `${url}/api`;
  return url;
}

function joinUrl(base: string, path: string): string {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

interface Stored {
  url: string;
  token: string | null;
  user: { name: string; email: string } | null;
}

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Stored>;
      // the address always comes from the build; an older save's address is ignored so a
      // stale value can never leave the catalogue unreachable
      const url = defaultUrl();
      if (s.url !== url) persist({ url, token: s.token ?? null, user: s.user ?? null });
      return { url, token: s.token ?? null, user: s.user ?? null };
    }
  } catch {
    // a broken entry just means "not connected"
  }
  return { url: defaultUrl(), token: null, user: null };
}

interface Envelope<T> {
  data: T;
  meta?: { current_page: number; last_page: number; total: number };
}

interface ServerStore extends Stored {
  busy: boolean;
  error: string | null;
  signIn: (url: string, mode: 'login' | 'register', fields: { email: string; password: string; name?: string }) => Promise<boolean>;
  signOut: () => void;
  setUrl: (url: string) => void;
  setError: (message: string | null) => void;
}

function persist(s: Stored) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(s));
  } catch {
    // storage blocked: the connection still works for this session
  }
}

export const useServer = create<ServerStore>((set, get) => ({
  ...readStored(),
  busy: false,
  error: null,
  setUrl: (url) => {
    const clean = normalizeUrl(url);
    set({ url: clean });
    persist({ url: clean, token: get().token, user: get().user });
  },
  setError: (error) => set({ error }),
  signOut: () => {
    const { url } = get();
    persist({ url, token: null, user: null });
    set({ token: null, user: null, error: null });
  },
  signIn: async (rawUrl, mode, fields) => {
    const url = normalizeUrl(rawUrl);
    if (!url) {
      set({ error: 'Cloud saves are not available in this build.' });
      return false;
    }
    set({ busy: true, error: null });
    try {
      const body = await request<Envelope<{ user: { name: string; email: string }; token: string }>>(
        mode === 'register' ? '/auth/register' : '/auth/login',
        { method: 'POST', url, body: fields },
      );
      const next: Stored = { url, token: body.data.token, user: body.data.user };
      persist(next);
      set({ ...next, busy: false, error: null });
      return true;
    } catch (e) {
      set({ busy: false, error: readable(e) });
      return false;
    }
  },
}));

/** A message for the player, in English like the rest of the game's own text. */
export function readable(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return 'The game server could not be reached. Please try again in a moment.';
    if (e.status === 401) return 'The server did not accept that email and password.';
    if (e.status === 422) return e.message;
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Whether the game server answers right now. The client asks this before showing a sign-in
 * form, so a stopped backend reads as "server offline" instead of a mysterious failure.
 */
export async function checkServer(): Promise<boolean> {
  const base = useServer.getState().url;
  if (!base) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(joinUrl(base, '/health'), { headers: { Accept: 'application/json' }, signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; url?: string; token?: string | null } = {},
): Promise<T> {
  const state = useServer.getState();
  const base = opts.url ?? state.url;
  if (!base) throw new ApiError('Cloud saves are not available in this build.', 0, 'no_url');
  const token = opts.token === undefined ? state.token : opts.token;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(joinUrl(base, path), {
      method: opts.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(opts.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError('Network error.', 0, 'network');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body: { message?: string; code?: string } | null = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    // a token the server no longer knows is dropped, so the screen offers the sign-in form again
    if (res.status === 401 && token && !path.startsWith('/auth/')) state.signOut();
    throw new ApiError(body?.message ?? `Server error ${res.status}`, res.status, body?.code);
  }
  return (body ?? { data: null }) as T;
}

/** Search the shared catalogue. Every filter is applied on the server. */
export async function searchPlayers(q: PlayerQuery): Promise<PlayerPage> {
  const p = new URLSearchParams();
  if (q.search?.trim()) p.set('search', q.search.trim());
  if (q.position && q.position !== 'ALL') p.set('position', q.position);
  if (q.origin && q.origin !== 'ALL') p.set('origin', q.origin);
  if (q.minAge !== undefined) p.set('min_age', String(q.minAge));
  if (q.maxAge !== undefined) p.set('max_age', String(q.maxAge));
  if (q.minRating) p.set('min_rating', String(Math.max(1, Math.round(q.minRating))));
  if (q.maxPrice && q.maxPrice < 5000) {
    p.set('min_price', '0');
    p.set('max_price', String(Math.round(q.maxPrice)));
  }
  p.set('sort', q.sort ?? 'overall');
  p.set('direction', q.sort === 'price' || q.sort === 'age' || q.sort === 'name' ? 'asc' : 'desc');
  p.set('page', String(q.page ?? 1));
  p.set('per_page', String(q.perPage ?? 30));
  const body = await request<Envelope<ServerPlayer[]>>(`/players?${p}`);
  return {
    items: body.data,
    total: body.meta?.total ?? body.data.length,
    page: body.meta?.current_page ?? 1,
    lastPage: body.meta?.last_page ?? 1,
  };
}

/**
 * Every player the catalogue holds for one origin, a page at a time. A season's save keeps its
 * own copy, so this reads the whole thing once rather than searching it while playing.
 */
export async function fetchCataloguePlayers(
  origin: 'real' | 'fictional' | 'ALL' = 'real',
  onProgress?: (loaded: number, total: number) => void,
): Promise<ServerPlayer[]> {
  const out: ServerPlayer[] = [];
  let page = 1;
  let lastPage = 1;
  let total = 0;
  do {
    const res = await searchPlayers({ origin, page, perPage: 100, sort: 'overall' });
    out.push(...res.items);
    lastPage = res.lastPage;
    total = res.total;
    onProgress?.(out.length, total);
    page++;
  } while (page <= lastPage);
  return out;
}

/** A club of the catalogue, with the league it plays in and how many players the catalogue lists for it. */
export interface CatalogueClub {
  id: number;
  name: string;
  league: string | null;
  is_fictional: boolean;
  players: number;
}

/** Every club the catalogue knows. */
export async function fetchCatalogueClubs(): Promise<CatalogueClub[]> {
  const out: CatalogueClub[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const body = await request<Envelope<CatalogueClub[]>>(`/clubs?per_page=100&page=${page}`);
    out.push(...body.data);
    lastPage = body.meta?.last_page ?? 1;
    page++;
  } while (page <= lastPage);
  return out;
}

/** One catalogue player, with their real-world career when the server has it. */
export async function getPlayer(id: number): Promise<ServerPlayer> {
  const body = await request<Envelope<ServerPlayer>>(`/players/${id}`);
  return body.data;
}

/** True when an address and a token are both set. */
export const isConnected = () => !!useServer.getState().url && !!useServer.getState().token;

/** A save on the server. Cloud saves carry the game's own world document. */
export interface GameSaveSummary {
  id: number;
  name: string;
  /** 'cloud' carries a world document; 'structured' is the hosted catalogue world */
  mode: 'cloud' | 'structured';
  season: number;
  game_date: string;
  club: { name: string | null } | null;
  world: { version: number; players: number } | null;
  updated_at: string;
}

/** The signed-in user's saves, newest first. The world document itself is not included. */
export async function listGameSaves(): Promise<GameSaveSummary[]> {
  const body = await request<Envelope<GameSaveSummary[]>>('/game-saves?per_page=25');
  return body.data;
}

/** Keep this playthrough on the server under a name of its own. */
export async function createCloudSave(name: string, world: GameState): Promise<GameSaveSummary> {
  const body = await request<Envelope<GameSaveSummary>>('/game-saves', { method: 'POST', body: { name, world } });
  return body.data;
}

/** Overwrite an existing cloud save with the current playthrough. */
export async function updateCloudSave(id: number, world: GameState): Promise<GameSaveSummary> {
  const body = await request<Envelope<GameSaveSummary>>(`/game-saves/${id}/world`, { method: 'PUT', body: { world } });
  return body.data;
}

/** The whole world of a cloud save, ready to be adopted as the running game. */
export async function loadCloudSave(id: number): Promise<GameState> {
  const body = await request<Envelope<{ world: GameState }>>(`/game-saves/${id}/world`);
  return body.data.world;
}

export async function deleteCloudSave(id: number): Promise<void> {
  await request<unknown>(`/game-saves/${id}`, { method: 'DELETE' });
}
