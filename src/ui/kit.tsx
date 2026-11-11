import { type ReactNode } from 'react';
import type { Player, Attr } from '../game/types';
import { ATTRS, ATTR_ICON, ATTR_LABEL } from '../game/types';
import { ICONS, rarity } from '../game/data';
import { SKINS, HAIRS } from '../match/sprites';
import { sfx } from '../audio';
import { LANGS, t } from '../i18n';
import { nationByCode, nationOf, type FlagMark, type Nation } from '../game/nations';
import { YELLOW_LIMIT, shirtOf } from '../game/world';
import { useStore } from '../store';

export function Btn(props: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'green' | 'red' | 'ghost' | 'blue'; disabled?: boolean; small?: boolean; title?: string; className?: string }) {
  const { children, onClick, kind = 'primary', disabled, small, title, className } = props;
  return (
    <button
      className={`btn ${kind} ${small ? 'small' : ''} ${className ?? ''}`}
      disabled={disabled}
      title={title}
      onClick={() => {
        sfx.click();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function Logo({ icon, color, color2, size = 48 }: { icon: number; color: string; color2: string; size?: number }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 48 53" className="logo" aria-hidden>
      <path d="M24 2 L44 8 V26 C44 38 35 47 24 51 C13 47 4 38 4 26 V8 Z" fill={color} stroke={color2} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M24 2 L44 8 V16 H4 V8 Z" fill={color2} opacity="0.35" />
      <text x="24" y="35" fontSize="22" textAnchor="middle">{ICONS[icon % ICONS.length]}</text>
    </svg>
  );
}

export function Jersey({ color, color2, size = 70, away, num, pattern = 0 }: { color: string; color2: string; size?: number; away?: boolean; num?: number; pattern?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label={away ? t('away jersey') : t('home jersey')}>
      <path d="M20 6 L8 14 L2 28 L12 33 L16 26 V58 H48 V26 L52 33 L62 28 L56 14 L44 6 C41 11 36 13 32 13 C28 13 23 11 20 6Z" fill={color} stroke="#1d2b53" strokeWidth="2.5" strokeLinejoin="round" />
      {pattern > 0 && (
        <g clipPath="url(#kcp)" opacity="0.85">
          <clipPath id="kcp"><path d="M20 6 L8 14 L2 28 L12 33 L16 26 V58 H48 V26 L52 33 L62 28 L56 14 L44 6 C41 11 36 13 32 13 C28 13 23 11 20 6Z" /></clipPath>
          {pattern === 1 && <><rect x="4" y="0" width="9" height="64" fill={color2} /><rect x="24" y="0" width="9" height="64" fill={color2} /><rect x="44" y="0" width="9" height="64" fill={color2} /></>}
          {pattern === 2 && <><rect x="0" y="14" width="64" height="8" fill={color2} /><rect x="0" y="30" width="64" height="8" fill={color2} /><rect x="0" y="46" width="64" height="8" fill={color2} /></>}
          {pattern === 3 && <rect x="0" y="0" width="32" height="64" fill={color2} />}
        </g>
      )}
      <rect x="16" y="34" width="32" height="7" fill={color2} opacity="0.9" />
      <path d="M20 6 C23 11 28 13 32 13 C36 13 41 11 44 6" fill="none" stroke={color2} strokeWidth="3" />
      {num !== undefined && <text x="32" y="45" textAnchor="middle" fontSize="24" fontWeight="700" fill="#fff" stroke="#1d2b53" strokeWidth="4" paintOrder="stroke" strokeLinejoin="round">{num}</text>}
    </svg>
  );
}

export function Avatar({ p, color = '#4cc9f0', size = 56 }: { p: Pick<Player, 'skin' | 'hair' | 'hairStyle'>; color?: string; size?: number }) {
  const skin = SKINS[p.skin];
  const hair = HAIRS[p.hair];
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" className="avatar" aria-hidden>
      <rect width="60" height="60" rx="14" fill="rgba(255,255,255,.35)" />
      <path d="M8 60 C8 46 18 42 30 42 C42 42 52 46 52 60Z" fill={color} />
      {p.hairStyle === 2 && <circle cx="30" cy="25" r="19" fill={hair} />}
      {p.hairStyle === 3 && <ellipse cx="17" cy="32" rx="7" ry="13" fill={hair} />}
      <circle cx="30" cy="27" r="16" fill={skin} />
      {p.hairStyle === 1 ? (
        <path d="M13 24 L16 10 L22 18 L27 7 L32 18 L38 8 L42 19 L47 12 L47 25 C40 17 20 17 13 24Z" fill={hair} />
      ) : (
        <path d="M13 26 C13 8 47 8 47 26 C40 17 21 17 13 26Z" fill={hair} />
      )}
      <ellipse cx="23" cy="29" rx="2.6" ry="3.4" fill="#1d2b53" />
      <ellipse cx="37" cy="29" rx="2.6" ry="3.4" fill="#1d2b53" />
      <circle cx="23.8" cy="28" r="0.9" fill="#fff" />
      <circle cx="37.8" cy="28" r="0.9" fill="#fff" />
      <path d="M24 36 Q30 41 36 36" stroke="#7a2e2e" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="19" cy="35" r="2.8" fill="#ff6b6b" opacity=".3" />
      <circle cx="41" cy="35" r="2.8" fill="#ff6b6b" opacity=".3" />
    </svg>
  );
}

/** A player's shirt number; nothing for players without a club. */
export function ShirtNo({ p }: { p: Pick<Player, 'num' | 'numClub' | 'clubId'> }) {
  const n = shirtOf(p);
  return n === undefined ? null : <span className="shirt-no" title={t('Shirt number')}>{n}</span>;
}

export const PosBadge = ({ pos }: { pos: string }) => <span className={`pos pos-${pos}`}>{pos}</span>;
/** Main position first, then every extra position the player has learned. */
export const PosBadges = ({ p }: { p: Pick<Player, 'pos' | 'extraPos'> }) => (
  <span className="pos-list"><PosBadge pos={p.pos} />{(p.extraPos ?? []).map((x) => <PosBadge key={x} pos={x} />)}</span>
);

export function OvrBadge({ v }: { v: number }) {
  return <span className={`ovr r-${rarity(v)}`}>{v}</span>;
}

export function Bar({ value, max = 100, color, label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const c = color ?? (pct > 75 ? 'var(--green)' : pct > 50 ? 'var(--yellow)' : pct > 30 ? 'var(--orange)' : 'var(--red)');
  return (
    <div className="bar" title={label}>
      <div className="bar-fill" style={{ width: `${pct}%`, background: c }} />
    </div>
  );
}

export function AttrBars({ p }: { p: Player }) {
  return (
    <div className="attrs">
      {ATTRS.map((a: Attr) => (
        <div key={a} className="attr-row">
          <span className="attr-name">{ATTR_ICON[a]} {t(ATTR_LABEL[a])}</span>
          <Bar value={p[a]} />
          <b>{p[a]}</b>
        </div>
      ))}
    </div>
  );
}

export function PlayerCard({ p, color, onClick, mini, big }: { p: Player; color?: string; onClick?: () => void; mini?: boolean; big?: boolean }) {
  return (
    <div className={`pcard r-${rarity(p.ovr)} ${mini ? 'mini' : ''} ${big ? 'big' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className="pcard-top">
        <div className="pcard-ovr">{p.ovr}<small>{p.pos}</small>{shirtOf(p) !== undefined && <small className="pcard-num">#{shirtOf(p)}</small>}</div>
        <Avatar p={p} color={color} size={mini ? 44 : big ? 132 : 64} />
      </div>
      <div className="pcard-name">{p.name}</div>
      {!mini && (
        <div className="pcard-stats">
          <span>⚡{p.speed}</span><span>🎯{p.shooting}</span><span>🤝{p.passing}</span>
          <span>🌀{p.dribbling}</span><span>🛡️{p.defending}</span><span>❤️{p.stamina}</span>
        </div>
      )}
    </div>
  );
}

export function Modal({ children, onClose, title, wide }: { children: ReactNode; onClose: () => void; title?: string; wide?: boolean }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={`modal pop ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="x" aria-label={t('Close')} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Coins = ({ n }: { n: number }) => <span className="coins">🪙 {Math.round(n).toLocaleString()}</span>;

export function Stars({ rep }: { rep: number }) {
  const s = Math.max(1, Math.min(5, Math.ceil(rep / 20)));
  return <span className="stars" title={t('Reputation {n}', { n: Math.round(rep) })}>{'★'.repeat(s)}{'☆'.repeat(5 - s)}</span>;
}

export function LineChart({ data, color = '#7b5cff', height = 70, label }: { data: number[]; color?: string; height?: number; label?: string }) {
  if (data.length < 2) return <div className="chart-empty">{label ?? t('Not enough data yet')}</div>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const w = 260;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - 8 - ((v - min) / Math.max(1, max - min)) * (height - 16)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="chart" preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((v, i) => (
        <circle key={i} cx={(i / (data.length - 1)) * w} cy={height - 8 - ((v - min) / Math.max(1, max - min)) * (height - 16)} r="3.5" fill="#fff" stroke={color} strokeWidth="2" />
      ))}
    </svg>
  );
}

export function PageTitle({ icon, title, sub, right }: { icon: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="page-title">
      <div className="pt-icon">{icon}</div>
      <div className="pt-text">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {right && <div className="pt-right">{right}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" aria-selected={value === tab.id} className={value === tab.id ? 'on' : ''} onClick={() => { sfx.click(); onChange(tab.id); }}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Renders text that may contain <b>bold</b> parts, so translations can keep their emphasis. */
export function Rich({ text }: { text: string }) {
  return <>{text.split(/<b>(.*?)<\/b>/).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}</>;
}

export function LangPicker() {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  return (
    <div className="seg" role="group" aria-label={t('Language')}>
      {LANGS.map((l) => (
        <button key={l.id} className={lang === l.id ? 'on' : ''} aria-pressed={lang === l.id} onClick={() => { sfx.click(); setLang(l.id); }}>
          {l.flag} {l.label}
        </button>
      ))}
    </div>
  );
}

const STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 2.3 : 5.6;
  const a = (Math.PI / 5) * i - Math.PI / 2;
  return `${(15 + r * Math.cos(a)).toFixed(2)},${(10 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

/** One shape of a drawn flag, on the 30×20 flag canvas. `under` is the colour behind it. */
function FlagShape({ mark, c, under }: { mark: FlagMark; c?: string; under: string }) {
  switch (mark) {
    case 'disc': return <circle cx="15" cy="10" r="6" fill={c} />;
    case 'dot': return <circle cx="15" cy="10" r="4.2" fill={c} />;
    case 'sun': return <circle cx="15" cy="10" r="2.6" fill={c} />;
    case 'halfdisc': return <path d="M9 10 A6 6 0 0 0 21 10 Z" fill={c} />;
    case 'cross': return <><rect x="12.5" y="0" width="5" height="20" fill={c} /><rect x="0" y="7.5" width="30" height="5" fill={c} /></>;
    case 'plus': return <><rect x="13" y="4" width="4" height="12" fill={c} /><rect x="9" y="8" width="12" height="4" fill={c} /></>;
    case 'nordic': return <><rect x="8" y="0" width="4" height="20" fill={c} /><rect x="0" y="8" width="30" height="4" fill={c} /></>;
    case 'nordicThin': return <><rect x="9" y="0" width="2" height="20" fill={c} /><rect x="0" y="9" width="30" height="2" fill={c} /></>;
    case 'saltire': return <path d="M0 0 L30 20 M30 0 L0 20" stroke={c} strokeWidth="3.4" fill="none" />;
    case 'diamond': return <path d="M15 2.5 L27 10 L15 17.5 L3 10 Z" fill={c} />;
    case 'star': return <polygon points={STAR} fill={c} />;
    case 'canton': return <rect x="0" y="0" width="13" height="10" fill={c} />;
    case 'triangle': return <path d="M0 0 L13 10 L0 20 Z" fill={c} />;
    case 'crescent': return <><circle cx="13" cy="10" r="5.2" fill={c} /><circle cx="14.6" cy="10" r="4.2" fill={under} /><circle cx="19.5" cy="10" r="1.6" fill={c} /></>;
  }
}

/** Small drawn flag (emoji flags do not show on every device). */
export function Flag({ nation, size = 18 }: { nation: Nation; size?: number }) {
  const w = 30;
  const h = 20;
  const n = nation.bands.length;
  return (
    <svg className="flag" width={size * 1.5} height={size} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={t(nation.name)}>
      <title>{t(nation.name)}</title>
      {nation.bands.map((color, i) => (nation.dir === 'h'
        ? <rect key={i} x="0" y={(h / n) * i} width={w} height={h / n + 0.5} fill={color} />
        : <rect key={i} x={(w / n) * i} y="0" width={w / n + 0.5} height={h} fill={color} />))}
      {nation.mark && <FlagShape mark={nation.mark} c={nation.markColor} under={nation.bands[0]} />}
      {nation.mark2 && <FlagShape mark={nation.mark2} c={nation.mark2Color} under={nation.markColor ?? nation.bands[0]} />}
      <rect x="0.5" y="0.5" width={w - 1} height={h - 1} rx="2" fill="none" stroke="#1d2b53" strokeWidth="1" />
    </svg>
  );
}

/** A player's flag, optionally with the country name. */
export function Nationality({ p, withName, size }: { p: Pick<Player, 'name'> & { nat?: string; natName?: string }; withName?: boolean; size?: number }) {
  const nation = nationOf(p);
  // a real player from a country the game has no flag for shows the country's name instead
  if (p.natName && nation.name.toLowerCase() !== p.natName.toLowerCase() && !(p.nat && nationByCode(p.nat))) return <span className="nat"><span>{p.natName}</span></span>;
  return <span className="nat"><Flag nation={nation} size={size} />{withName && <span>{t(nation.name)}</span>}</span>;
}

/** Why a player cannot play (injury, suspension) and how many yellow cards they carry. */
export function StatusTags({ p }: { p: Pick<Player, 'injury' | 'ban' | 'yellows'> }) {
  const injury = p.injury ?? 0;
  const ban = p.ban ?? 0;
  const yellows = p.yellows ?? 0;
  if (!injury && !ban && !yellows) return null;
  return (
    <>
      {injury > 0 && <span className="tag red" style={{ marginLeft: 6 }} title={t('Injured: back in {n} matchdays', { n: injury })}>🤕 {injury}</span>}
      {ban > 0 && <span className="tag red" style={{ marginLeft: 6 }} title={t('Suspended for the next match')}>🟥 {t('BAN')}</span>}
      {yellows > 0 && <span className="tag yellow" style={{ marginLeft: 6 }} title={t('Yellow cards this season: {n} (a ban at {max})', { n: yellows, max: YELLOW_LIMIT })}>🟨 {yellows}</span>}
    </>
  );
}
