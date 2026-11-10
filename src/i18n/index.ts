// Languages. English text is the key; other languages map that key to their own text.
// Text made by the game logic (news, match commentary, money log) is stored in English
// and translated when shown, so old saves and a language switch both read correctly.
import { id } from './id';

export type Lang = 'en' | 'id';
export const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: 'id', label: 'Indonesia', flag: '🇮🇩' },
  { id: 'en', label: 'English', flag: '🇬🇧' },
];

export interface Dictionary {
  /** English key -> translation. `{name}` is a value; `{$name}` is a value that is itself translated. */
  text: Record<string, string>;
  /** 1 -> "1st" in this language. */
  ordinal: (n: number) => string;
}

const DICTS: Record<Exclude<Lang, 'en'>, Dictionary> = { id };
const LANG_KEY = 'kfm-lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && LANGS.some((l) => l.id === saved)) return saved as Lang;
  } catch {
    // storage blocked: fall through to the default
  }
  // Indonesian is the game's main language; English is one tap away in the menu
  return 'id';
}

let lang: Lang = detect();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  cache.clear();
  document.documentElement.lang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    // not saved; the choice still applies to this session
  }
}

type Vars = Record<string, string | number>;
const PLACEHOLDER = /\{(\$?)(\w+)\}/g;
const fill = (s: string, vars?: Vars) => (vars ? s.replace(PLACEHOLDER, (m, _d, k: string) => (k in vars ? String(vars[k]) : m)) : s);

/**
 * Translate interface text. A key may end in `|context` to tell apart two uses of the same
 * English word ("Home|kit"); the context is never shown.
 */
export function t(key: string, vars?: Vars): string {
  const english = key.split('|')[0];
  if (lang === 'en') return fill(english, vars);
  return fill(DICTS[lang].text[key] ?? english, vars);
}

interface Pattern {
  re: RegExp;
  to: string;
  weight: number;
}
const patternCache = new Map<Lang, Pattern[]>();
const cache = new Map<string, string>();

function patterns(l: Exclude<Lang, 'en'>): Pattern[] {
  let list = patternCache.get(l);
  if (!list) {
    list = [];
    for (const [key, to] of Object.entries(DICTS[l].text)) {
      if (!key.includes('{')) continue;
      const english = key.split('|')[0];
      const literal = english.replace(PLACEHOLDER, '');
      const src = english
        .split(PLACEHOLDER)
        // split() with two groups yields: text, "$" or "", name, text, ...
        .map((part, i) => (i % 3 === 0 ? part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : i % 3 === 2 ? `(?<${part}>.+?)` : ''))
        .join('');
      list.push({ re: new RegExp(`^${src}$`, 'u'), to, weight: literal.length });
    }
    // most specific sentence first, so a short pattern never swallows a longer one
    list.sort((a, b) => b.weight - a.weight);
    patternCache.set(l, list);
  }
  return list;
}

/** Translate text produced by the game logic (stored in English). Unknown text is returned unchanged. */
export function tx(text: string): string {
  if (lang === 'en' || !text) return text;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const dict = DICTS[lang];
  const s = text.trim();
  let out = dict.text[s];
  if (out === undefined) {
    const ord = /^(\d+)(st|nd|rd|th)$/.exec(s);
    if (ord) out = dict.ordinal(+ord[1]);
  }
  if (out === undefined) {
    out = s;
    for (const p of patterns(lang)) {
      const m = p.re.exec(s);
      if (!m) continue;
      const groups = m.groups ?? {};
      out = p.to.replace(PLACEHOLDER, (_all, deep: string, k: string) => (deep ? tx(groups[k] ?? '') : (groups[k] ?? '')));
      break;
    }
  }
  if (cache.size > 2000) cache.clear();
  cache.set(text, out);
  return out;
}
