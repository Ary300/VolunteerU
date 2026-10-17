'use client';

/* ==========================================================================
   ui.jsx, the design system, expressed once
   Each primitive takes the design's literal numbers (height, padding, radius,
   font size) so call sites stay 1:1 with `VolunteerU Design.dc.html` while
   sharing a single implementation.
   ========================================================================== */

import { useEffect, useId, useState, useRef } from 'react';
import { S, s, cx, T, GRAD, SH, H } from '../lib/style.js';

/* ---- icons ---------------------------------------------------------------
   One stroke icon set (24px grid, currentColor) so no screen has to reach for
   an emoji or a text glyph. Decorative by default (aria-hidden); pass `label`
   when the icon is the only thing that carries meaning.
   ------------------------------------------------------------------------- */

const P = (d) => ({ d });
const ICON_PATHS = {
  check: [P('M5 12.5l4.5 4.5L19 7.5')],
  x: [P('M6 6l12 12'), P('M18 6L6 18')],
  plus: [P('M12 5v14'), P('M5 12h14')],
  minus: [P('M5 12h14')],
  'arrow-right': [P('M5 12h14'), P('M13 6l6 6-6 6')],
  'arrow-left': [P('M19 12H5'), P('M11 6l-6 6 6 6')],
  'arrow-up': [P('M12 19V5'), P('M6 11l6-6 6 6')],
  'arrow-down': [P('M12 5v14'), P('M6 13l6 6 6-6')],
  external: [P('M14 5h5v5'), P('M19 5l-8 8'), P('M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4')],
  'chevron-down': [P('M6 9l6 6 6-6')],
  'chevron-up': [P('M6 15l6-6 6 6')],
  'chevron-right': [P('M9 6l6 6-6 6')],
  'chevron-left': [P('M15 6l-6 6 6 6')],
  star: [P('M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z')],
  heart: [P('M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z')],
  pin: [P('M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z'), P('M12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z')],
  calendar: [P('M5 6.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1z'), P('M4 10.5h16'), P('M8.5 4v4'), P('M15.5 4v4')],
  clock: [P('M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z'), P('M12 7.5V12l3 2')],
  search: [P('M10.8 17.6a6.8 6.8 0 1 0 0-13.6 6.8 6.8 0 0 0 0 13.6z'), P('M15.8 15.8L20 20')],
  bell: [P('M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5z'), P('M10 20.5a2 2 0 0 0 4 0')],
  home: [P('M4.5 10.5L12 4.5l7.5 6V19a1 1 0 0 1-1 1h-4v-5.5h-5V20h-4a1 1 0 0 1-1-1z')],
  compass: [P('M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z'), P('M15.5 8.5l-2 5-5 2 2-5z')],
  user: [P('M12 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5z'), P('M4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5')],
  users: [P('M9 11a3.4 3.4 0 1 0 0-6.8A3.4 3.4 0 0 0 9 11z'), P('M2.8 19.5c.7-3.2 3.2-5 6.2-5s5.5 1.8 6.2 5'), P('M15.5 4.6a3.2 3.2 0 0 1 0 6.1'), P('M17.6 14.7c1.9.6 3.2 2.2 3.6 4.8')],
  flag: [P('M5.5 21V4.5'), P('M5.5 5h11l-2 4 2 4h-11')],
  settings: [P('M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z'), P('M19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7.4 7.4 0 0 1-2.2 1.3l-.3 2h-3.6l-.3-2a7.4 7.4 0 0 1-2.2-1.3l-1.9.7-1.8-3.1 1.6-1.2a7.4 7.4 0 0 1 0-3L3 9.3l1.8-3.1 1.9.7A7.4 7.4 0 0 1 8.9 5.6l.3-2h3.6l.3 2a7.4 7.4 0 0 1 2.2 1.3l1.9-.7L19 9.3l-1.6 1.2a7.4 7.4 0 0 1 0 3z')],
  help: [P('M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z'), P('M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7'), P('M12 17h.01')],
  info: [P('M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z'), P('M12 11v5.5'), P('M12 7.8h.01')],
  alert: [P('M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z'), P('M12 7.5v5.5'), P('M12 16.3h.01')],
  'check-circle': [P('M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z'), P('M8.3 12.3l2.5 2.5 4.9-5.1')],
  'x-circle': [P('M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z'), P('M9.2 9.2l5.6 5.6'), P('M14.8 9.2l-5.6 5.6')],
  'log-out': [P('M14 4.5h4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-4'), P('M10 8l-4 4 4 4'), P('M6 12h9')],
  bookmark: [P('M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1z')],
  edit: [P('M4.5 19.5l1-4L15.8 5.2a1.8 1.8 0 0 1 2.5 0l.5.5a1.8 1.8 0 0 1 0 2.5L8.5 18.5z'), P('M13.8 7.2l3 3')],
  trash: [P('M4.5 7h15'), P('M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2'), P('M6.5 7l.8 12a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1l.8-12')],
  link: [P('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1'), P('M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1')],
  copy: [P('M9 9h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z'), P('M5 15H4.5a.5.5 0 0 1-.5-.5V5a1 1 0 0 1 1-1h9.5a.5.5 0 0 1 .5.5V5')],
  mail: [P('M4.5 6h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z'), P('M4 7l8 6 8-6')],
  message: [P('M5 5h14a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-8L7 20v-3.5H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z')],
  send: [P('M20 4L10.5 13.5'), P('M20 4l-6 16-3.5-6.5L4 10z')],
  filter: [P('M4 5.5h16'), P('M7 12h10'), P('M10 18.5h4')],
  list: [P('M9 6.5h11'), P('M9 12h11'), P('M9 17.5h11'), P('M4.5 6.5h.01'), P('M4.5 12h.01'), P('M4.5 17.5h.01')],
  grid: [P('M5 5h5.5v5.5H5z'), P('M13.5 5H19v5.5h-5.5z'), P('M5 13.5h5.5V19H5z'), P('M13.5 13.5H19V19h-5.5z')],
  more: [P('M6 12h.01'), P('M12 12h.01'), P('M18 12h.01')],
  menu: [P('M4.5 7h15'), P('M4.5 12h15'), P('M4.5 17h15')],
  lock: [P('M6.5 10.5h11a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1z'), P('M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5')],
  eye: [P('M2.8 12S6 5.8 12 5.8 21.2 12 21.2 12 18 18.2 12 18.2 2.8 12 2.8 12z'), P('M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z')],
  'eye-off': [P('M4 4l16 16'), P('M10 6a9.7 9.7 0 0 1 2-.2c6 0 9.2 6.2 9.2 6.2a16 16 0 0 1-2.6 3.4'), P('M6.6 7.6A15.4 15.4 0 0 0 2.8 12S6 18.2 12 18.2a9 9 0 0 0 4.4-1.1'), P('M10 10a2.8 2.8 0 0 0 4 4')],
  download: [P('M12 4v11'), P('M7.5 10.5L12 15l4.5-4.5'), P('M5 19.5h14')],
  upload: [P('M12 15V4'), P('M7.5 8.5L12 4l4.5 4.5'), P('M5 19.5h14')],
  share: [P('M12 15V4'), P('M8 8l4-4 4 4'), P('M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7')],
  image: [P('M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'), P('M4.5 16l4.5-4.5 4 4 2.5-2.5 4 4'), P('M15.5 9.5h.01')],
  map: [P('M9 5L4 7v12l5-2 6 2 5-2V5l-5 2z'), P('M9 5v12'), P('M15 7v12')],
  globe: [P('M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z'), P('M3.5 12h17'), P('M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5z')],
  building: [P('M5 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15'), P('M15 9.5h3a1 1 0 0 1 1 1V20'), P('M3.5 20h17'), P('M8.5 8h3'), P('M8.5 11.5h3'), P('M8.5 15h3')],
  clipboard: [P('M9 4.5h6v2.5H9z'), P('M15 5.5h2.5a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1H9'), P('M9 12h6'), P('M9 15.5h4')],
  inbox: [P('M4 13.5l2.2-7.6a1 1 0 0 1 1-.7h9.6a1 1 0 0 1 1 .7l2.2 7.6V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z'), P('M4 13.5h4.5l1.2 2h4.6l1.2-2H20')],
  award: [P('M12 14.5a5.3 5.3 0 1 0 0-10.6 5.3 5.3 0 0 0 0 10.6z'), P('M8.8 13.5L7.5 21l4.5-2.5 4.5 2.5-1.3-7.5')],
  leaf: [P('M5 19c0-8 5-13.5 14-14 0 9-5.5 14-14 14z'), P('M5 19l7-7')],
  refresh: [P('M19.5 12a7.5 7.5 0 0 1-13 5.1'), P('M4.5 12a7.5 7.5 0 0 1 13-5.1'), P('M17.5 3.5v3.6h-3.6'), P('M6.5 20.5v-3.6h3.6')],
  phone: [P('M8 3.5h8a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z'), P('M11 17.5h2')],
  laptop: [P('M5.5 6h13a1 1 0 0 1 1 1v8.5h-15V7a1 1 0 0 1 1-1z'), P('M3 18.5h18')],
  sun: [P('M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'), P('M12 2.5v2'), P('M12 19.5v2'), P('M2.5 12h2'), P('M19.5 12h2'), P('M5.3 5.3l1.4 1.4'), P('M17.3 17.3l1.4 1.4'), P('M5.3 18.7l1.4-1.4'), P('M17.3 6.7l1.4-1.4')],
  contrast: [P('M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z'), P('M12 3.5v17'), P('M12 3.5a8.5 8.5 0 0 1 0 17z')],
  text: [P('M5 6.5V5h14v1.5'), P('M12 5v14'), P('M9.5 19h5')],
  shield: [P('M12 3.5l7 2.5v5.5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6z')],
  file: [P('M7 3.5h7l4.5 4.5v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z'), P('M13.5 3.5V8.5H18.5')],
  folder: [P('M4 6.5a1 1 0 0 1 1-1h4.5l2 2H19a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z')],
  dot: [P('M12 12h.01')],
};
/* Glyphs used by older call sites, mapped onto the set above so a stray
   arrow or check glyph passed as an `icon` prop renders as a drawn icon. */
const GLYPH_ICON = {
  '✓': 'check', '✔': 'check', '☑': 'check-circle', '✕': 'x', '✗': 'x', '×': 'x',
  '→': 'arrow-right', '←': 'arrow-left', '↑': 'arrow-up', '↓': 'arrow-down', '↗': 'external',
  '＋': 'plus', '+': 'plus', '−': 'minus', '★': 'star', '⭐': 'star', '☆': 'star', '♥': 'heart', '❤': 'heart',
  '📍': 'pin', '🔗': 'link', '📋': 'clipboard', '💬': 'message', '💻': 'laptop', '⚙': 'settings', '?': 'help',
  '⇥': 'log-out', '☰': 'bell', '☺': 'user', '❖': 'users', '◈': 'flag', '◎': 'compass', '◇': 'home',
  '◷': 'clock', '✎': 'edit', '▤': 'list', '⋯': 'more', '⚑': 'flag', '◐': 'contrast', '🔀': 'refresh', '▾': 'chevron-down',
};

export const ICON_NAMES = Object.keys(ICON_PATHS);

export function Icon({ name, size = 16, stroke = 1.75, label, filled = false, color, style, className }) {
  const paths = ICON_PATHS[name] || ICON_PATHS[GLYPH_ICON[name]];
  if (!paths) return null;
  const fillable = filled && (name === 'star' || name === 'heart' || name === 'bookmark' || name === 'pin');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fillable ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
      className={className}
      style={{ display: 'block', flex: 'none', color, ...(style || {}) }}
    >
      {paths.map((p, i) => (
        <path key={i} d={p.d} />
      ))}
    </svg>
  );
}

/** Accepts an icon name, a legacy glyph or a React node; returns something renderable or null. */
export function renderIcon(icon, size = 14, extra) {
  if (!icon) return null;
  if (typeof icon !== 'string') return icon;
  if (ICON_PATHS[icon] || GLYPH_ICON[icon]) return <Icon name={icon} size={size} {...(extra || {})} />;
  return null;
}

/* ---- image slot (reimplements <image-slot>) ----------------------------- */

export function ImageSlot({ src, shape = 'rounded', radius = 12, placeholder = 'photo', alt = '' }) {
  const [status, setStatus] = useState('loading');
  const ref = useRef(null);

  useEffect(() => {
    setStatus('loading');
  }, [src]);

  // A cached image can finish before React attaches onLoad.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete) setStatus(img.naturalWidth ? 'ready' : 'failed');
  }, [src]);

  const br =
    shape === 'circle' ? 'border-radius:50%' : shape === 'pill' ? 'border-radius:999px' : shape === 'rounded' ? `border-radius:${radius}px` : '';

  const hasSrc = Boolean(src);
  return (
    <div className="vu-slot" data-state={hasSrc ? status : 'failed'} style={S(br)}>
      {hasSrc ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={ref}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('failed')}
        />
      ) : null}
      <span className="vu-slot-ph" aria-hidden="true">
        <Icon name="image" size={16} stroke={1.5} />
      </span>
    </div>
  );
}

/* An identity avatar for REAL people. Shows their real photo if we have one,
   otherwise their initials, never a stock face, so a real volunteer is never
   represented by someone else's photo. Colors are drawn only from the design's
   own warm token pairs (the same tints used for badges/slots), so it reads as a
   native placeholder rather than an off-palette element. Fills its (already
   sized, rounded, overflow-hidden) wrapper. */
const AVATAR_TONES = [
  { bg: '#EFE9E2', fg: '#8A8179' }, // warm neutral (the design's slot placeholder)
  { bg: '#F5E7E0', fg: '#A8482A' }, // brand tint
  { bg: '#EAF3EC', fg: '#3F6B4E' }, // ok tint
  { bg: '#FDF3E7', fg: '#8A5A20' }, // warn tint
];
export function Avatar({ name = '', src = '', fs = 15 }) {
  if (src) return <ImageSlot src={src} shape="circle" placeholder="face" />;
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const initials = (parts.slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
  let h = 0;
  for (const c of String(name || 'x')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const tone = AVATAR_TONES[h % AVATAR_TONES.length];
  return (
    <div aria-hidden="true" style={S(`width:100%;height:100%;display:grid;place-items:center;background:${tone.bg};color:${tone.fg};font:600 ${fs}px/1 Geist`)}>
      {initials}
    </div>
  );
}

/* ---- buttons ------------------------------------------------------------ */

const flexBase = (o) =>
  [
    o.full ? 'display:flex;width:100%' : 'display:inline-flex',
    'align-items:center',
    o.center ? 'justify-content:center' : '',
    'gap:9px;white-space:nowrap',
    o.full ? '' : 'flex:none',
  ]
    .filter(Boolean)
    .join(';');

export function PrimaryButton({
  children,
  h = 40,
  px = 18,
  r = 11,
  fs = 14,
  sh = 'none',
  icon = null,
  iconSize = 14,
  ls,
  lift = false,
  onClick,
  disabled,
  busy,
  type = 'button',
  center,
  full,
  extra = '',
  ...rest
}) {
  return (
    <button
      type={type}
      className={cx(lift ? H.primaryLift : H.primary, H.press)}
      onClick={onClick}
      disabled={disabled || busy}
      data-disabled={disabled ? 'true' : undefined}
      data-busy={busy ? 'true' : undefined}
      style={s(
        flexBase({ center, full }),
        `padding:0 ${px}px`,
        `height:${h}px`,
        `border-radius:${r}px`,
        'border:1px solid #A8482A',
        `background:${GRAD}`,
        'color:#fff',
        `font:600 ${fs}px/1 Geist`,
        ls ? `letter-spacing:${ls}` : '',
        'cursor:pointer',
        `box-shadow:${sh}`,
        'transition:transform .16s ease, filter .16s ease, background .16s ease',
        extra
      )}
      {...rest}
    >
      {busy ? <span className="vu-spin" /> : renderIcon(icon, iconSize)}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  h = 40,
  px = 16,
  r = 11,
  fs = 14,
  color = '#1A1714',
  borderColor = '#E4DDD4',
  bg = '#fff',
  icon,
  iconSize = 14,
  lift = false,
  onClick,
  disabled,
  busy,
  type = 'button',
  center,
  full,
  extra = '',
  shadow = true,
  ...rest
}) {
  return (
    <button
      type={type}
      className={cx(lift ? H.secondaryLift : H.secondary, H.press)}
      onClick={onClick}
      disabled={disabled || busy}
      data-disabled={disabled ? 'true' : undefined}
      data-busy={busy ? 'true' : undefined}
      style={s(
        flexBase({ center, full }),
        `padding:0 ${px}px`,
        `height:${h}px`,
        `border-radius:${r}px`,
        `border:1px solid ${borderColor}`,
        `background:${bg}`,
        `color:${color}`,
        `font:600 ${fs}px/1 Geist`,
        'cursor:pointer',
        shadow ? `box-shadow:${SH.hairline}` : '',
        'transition:background .16s ease, border-color .16s ease, transform .16s ease',
        extra
      )}
      {...rest}
    >
      {busy ? <span className="vu-spin" /> : renderIcon(icon, iconSize, { color: '#C2603C' })}
      {children}
    </button>
  );
}

/** Small pill used inside table rows and cards. */
export function GhostButton({ children, py = 6, px = 9, r = 7, fs = 11, color = '#57504A', tone, onClick, disabled, ...rest }) {
  return (
    <button
      type="button"
      className={cx(tone === 'danger' ? H.danger : H.secondary, H.press)}
      onClick={onClick}
      disabled={disabled}
      data-disabled={disabled ? 'true' : undefined}
      style={s(
        `padding:${py}px ${px}px`,
        `border-radius:${r}px`,
        `border:1px solid ${tone === 'danger' ? '#EBD3C8' : '#E8E1D9'}`,
        'background:#fff',
        `font:500 ${fs}px/1 Geist`,
        `color:${color}`,
        'cursor:pointer',
        'transition:background .16s ease, border-color .16s ease'
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Text-only action ("See all 12", "Manage people"). */
export function LinkButton({ children, fs = 13, color = '#C2603C', onClick, extra = '', ...rest }) {
  return (
    <button
      type="button"
      className={cx(H.link, H.press)}
      onClick={onClick}
      style={s(`font:500 ${fs}px/1 Geist`, `color:${color}`, 'cursor:pointer;background:none;border:none;padding:0', 'transition:opacity .16s ease', extra)}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * A div that behaves like a button. The design draws most of its controls as
 * plain divs; this keeps that markup while restoring keyboard operability.
 */
export function Pressable({ as: Tag = 'div', children, onClick, label, pressed, expanded, current, disabled, className, style, role = 'button', ...rest }) {
  const activate = (e) => {
    if (disabled) return;
    onClick && onClick(e);
  };
  return (
    <Tag
      role={role}
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed ? 'true' : 'false'}
      aria-expanded={expanded === undefined ? undefined : expanded ? 'true' : 'false'}
      aria-current={current}
      aria-disabled={disabled ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      className={cx(H.press, className)}
      style={style}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate(e);
        }
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* ---- fields -------------------------------------------------------------- */

export function Field({
  label,
  value = '',
  onChange,
  onEnter,
  placeholder = '',
  type = 'text',
  bg = '#fff',
  fs = 15,
  error,
  hint,
  required,
  inputMode,
  autoComplete,
  maxLength,
  readOnly,
  disabled,
  id,
  name,
  ariaLabel,
}) {
  const auto = useId();
  const fid = id || auto;
  const eid = `${fid}-err`;
  return (
    <div>
      {label ? (
        <label htmlFor={fid} style={S('display:block;font:500 12px/1 Geist;color:#57504A')}>
          {label}
          {required ? (
            <span aria-hidden="true" style={S('color:#C2603C')}>
              {' *'}
            </span>
          ) : null}
        </label>
      ) : null}
      <input
        id={fid}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        readOnly={readOnly}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={error ? 'true' : undefined}
        data-invalid={error ? 'true' : undefined}
        aria-describedby={error ? eid : undefined}
        onChange={(e) => onChange && onChange(e.target.value, e)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter(e.currentTarget.value);
          }
        }}
        className={H.input}
        style={s(
          `margin-top:${label ? 8 : 0}px`,
          'width:100%;padding:12px 14px;border-radius:10px',
          'border:1px solid #E8E1D9',
          `background:${bg}`,
          `font:450 ${fs}px/1.15 Geist`,
          'color:#1A1714',
          readOnly ? 'color:#6B635C' : '',
          'transition:border-color .16s ease'
        )}
      />
      {error ? (
        <div className="vu-err" id={eid}>
          {error}
        </div>
      ) : hint ? (
        <div className="vu-hint">{hint}</div>
      ) : null}
    </div>
  );
}

/** Words in a string, whitespace-separated. Empty/whitespace counts as 0. */
export function countWords(str) {
  const t = String(str || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

export function TextArea({
  label,
  value = '',
  onChange,
  placeholder = '',
  minHeight = 80,
  maxLength,
  maxWords,
  counter,
  error,
  hint,
  bg = '#fff',
  fs = 15,
  required,
  id,
  name,
  ariaLabel,
}) {
  const auto = useId();
  const fid = id || auto;
  const eid = `${fid}-err`;
  const len = String(value || '').length;
  const words = countWords(value);
  // A word cap keeps a generous char safety net so paste-bombs can't blow up the
  // field, but the visible counter and the over-limit flag track words.
  const charGuard = maxWords ? maxWords * 12 : maxLength;
  return (
    <div>
      {label ? (
        <div style={S('display:flex;align-items:baseline;justify-content:space-between')}>
          <label htmlFor={fid} style={S('font:500 12px/1 Geist;color:#57504A')}>
            {label}
            {required ? (
              <span aria-hidden="true" style={S('color:#C2603C')}>
                {' *'}
              </span>
            ) : null}
          </label>
          {counter && maxWords ? (
            <div className="vu-count" data-over={words > maxWords ? 'true' : 'false'}>
              {words} / {maxWords} words
            </div>
          ) : counter && maxLength ? (
            <div className="vu-count" data-over={len > maxLength ? 'true' : 'false'}>
              {len} / {maxLength}
            </div>
          ) : null}
        </div>
      ) : null}
      <textarea
        id={fid}
        name={name}
        value={value}
        placeholder={placeholder}
        maxLength={charGuard}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={error ? 'true' : undefined}
        data-invalid={error ? 'true' : undefined}
        aria-describedby={error ? eid : undefined}
        onChange={(e) => onChange && onChange(e.target.value, e)}
        className={H.input}
        style={s(
          `margin-top:${label ? 8 : 0}px`,
          'display:block;width:100%;padding:14px;border-radius:12px',
          'border:1px solid #E8E1D9',
          `background:${bg}`,
          `min-height:${minHeight}px`,
          `font:450 ${fs}px/1.55 Geist`,
          'color:#332D28',
          'transition:border-color .16s ease'
        )}
      />
      {error ? (
        <div className="vu-err" id={eid}>
          {error}
        </div>
      ) : hint ? (
        <div className="vu-hint">{hint}</div>
      ) : null}
    </div>
  );
}

/** Select styled to match the design's value boxes, with a chevron. */
export function Select({ label, value, onChange, options = [], bg = '#fff', fs = 15, error, hint, id, name, ariaLabel }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <div>
      {label ? (
        <label htmlFor={fid} style={S('display:block;font:500 12px/1 Geist;color:#57504A')}>
          {label}
        </label>
      ) : null}
      <div style={s('position:relative', `margin-top:${label ? 8 : 0}px`)}>
        <select
          id={fid}
          name={name}
          value={value}
          aria-label={ariaLabel}
          aria-invalid={error ? 'true' : undefined}
          data-invalid={error ? 'true' : undefined}
          onChange={(e) => onChange && onChange(e.target.value, e)}
          className={H.input}
          style={s(
            'width:100%;padding:12px 34px 12px 14px;border-radius:10px',
            'border:1px solid #E8E1D9',
            `background:${bg}`,
            `font:450 ${fs}px/1.15 Geist`,
            'color:#1A1714;cursor:pointer',
            'transition:border-color .16s ease'
          )}
        >
          {options.map((op) => {
            const v = op && op.v !== undefined ? op.v : op;
            const l = op && op.l !== undefined ? op.l : op;
            return (
              <option key={String(v)} value={v}>
                {l}
              </option>
            );
          })}
        </select>
        <span aria-hidden="true" style={S('position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none;color:#8A8179')}>
          <Icon name="chevron-down" size={14} />
        </span>
      </div>
      {error ? <div className="vu-err">{error}</div> : hint ? <div className="vu-hint">{hint}</div> : null}
    </div>
  );
}

/** Checkbox drawn exactly like the design's 17px rounded tick box. */
export function Checkbox({ checked, onChange, label, size = 17, id, describedBy }) {
  const auto = useId();
  const cid = id || auto;
  return (
    <label htmlFor={cid} className={H.link} style={S('display:flex;gap:11px;align-items:flex-start;cursor:pointer')}>
      <input
        id={cid}
        type="checkbox"
        className="vu-sr"
        checked={!!checked}
        aria-describedby={describedBy}
        onChange={(e) => onChange && onChange(e.target.checked, e)}
      />
      <span
        aria-hidden="true"
        style={s(
          `width:${size}px;height:${size}px;border-radius:5px`,
          `border:1px solid ${checked ? '#C2603C' : '#E0D8CF'}`,
          `background:${checked ? '#FAF6F3' : '#FCFAF8'}`,
          'flex:none;margin-top:2px;display:grid;place-items:center',
          'font:600 9px/1 Geist;color:#C2603C',
          'transition:border-color .16s ease, background .16s ease'
        )}
      >
        {checked ? <Icon name="check" size={12} stroke={2.25} /> : null}
      </span>
      <span style={S('font:450 14px/1.45 Geist;color:#332D28')}>{label}</span>
    </label>
  );
}

export function RadioDot({ checked }) {
  return (
    <span
      aria-hidden="true"
      style={s(
        'width:18px;height:18px;border-radius:50%',
        `border:1px solid ${checked ? '#C2603C' : '#D8CEC3'}`,
        'background:#fff;flex:none;display:grid;place-items:center',
        'transition:border-color .16s ease'
      )}
    >
      {checked ? <span className="vu-pop" style={S('width:9px;height:9px;border-radius:50%;background:#C2603C')} /> : null}
    </span>
  );
}

/**
 * Settings toggle. The design draws a single static state; a real switch has
 * to show both, so ON moves the knob and fills the track.
 */
export function Toggle({ on, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on ? 'true' : 'false'}
      aria-label={label}
      disabled={disabled}
      data-disabled={disabled ? 'true' : undefined}
      className={H.press}
      onClick={() => onChange && onChange(!on)}
      style={s(
        'width:38px;height:22px;border-radius:12px',
        `background:${on ? '#C2603C' : '#EFE7DF'}`,
        `border:1px solid ${on ? '#A8482A' : '#E4DAD0'}`,
        'position:relative;cursor:pointer;flex:none',
        'transition:background .16s ease, border-color .16s ease'
      )}
    >
      <span
        aria-hidden="true"
        style={s(
          'position:absolute;top:2px',
          `left:${on ? 18 : 2}px`,
          'width:16px;height:16px;border-radius:50%',
          `background:${on ? '#fff' : '#C2603C'}`,
          'transition:left .16s cubic-bezier(.22,.61,.36,1), background .16s ease'
        )}
      />
    </button>
  );
}

/** Selectable chip, the design's pill in both selected and idle states. */
export function Chip({ label, on, onClick, py = 10, px = 14, r = 10, fs = 14, role = 'button', ariaLabel, count }) {
  const isCheckbox = role === 'checkbox';
  return (
    <button
      type="button"
      role={isCheckbox ? 'checkbox' : undefined}
      aria-checked={isCheckbox ? (on ? 'true' : 'false') : undefined}
      aria-pressed={isCheckbox ? undefined : on ? 'true' : 'false'}
      aria-label={ariaLabel}
      className={cx(on ? H.link : H.chip, H.press)}
      onClick={onClick}
      style={s(
        `padding:${py}px ${px}px`,
        `border-radius:${r}px`,
        `border:1px solid ${on ? '#1F1B18' : '#E8E1D9'}`,
        `background:${on ? '#1F1B18' : '#fff'}`,
        `font:500 ${fs}px/1 Geist`,
        `color:${on ? '#fff' : '#332D28'}`,
        'cursor:pointer',
        'transition:background .16s ease, border-color .16s ease, color .16s ease'
      )}
    >
      {label}
      {count !== undefined && count !== null ? (
        <span style={S(`margin-left:7px;font:500 11px/1 ${T.mono};opacity:.7`)}>{count}</span>
      ) : null}
    </button>
  );
}

export function Badge({ label, bg = '#F6F2EE', color = '#57504A', py = 5, px = 9, r = 7, fs = 11, mono = true }) {
  return (
    <span
      style={s(
        `display:inline-block;padding:${py}px ${px}px`,
        `border-radius:${r}px`,
        `background:${bg}`,
        `font:500 ${fs}px/1 ${mono ? T.mono : 'Geist'}`,
        `color:${color}`,
        'white-space:nowrap'
      )}
    >
      {label}
    </span>
  );
}

export function ProgressBar({ pct, h = 6, bg = '#F1EBE4', fill = '#C2603C', r = 4, label }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={s(`height:${h}px`, `border-radius:${r}px`, `background:${bg}`, 'overflow:hidden')}
    >
      <div style={s(`width:${clamped}%`, 'height:100%', `border-radius:${r}px`, `background:${fill}`, 'transition:width .36s cubic-bezier(.16,1,.3,1)')} />
    </div>
  );
}

/* ---- states -------------------------------------------------------------- */

// The title is a real heading so screen-reader heading navigation finds it.
// Full-size empty states usually stand in for a whole screen or section (h2);
// compact ones sit inside a card under a section heading (h3). Pass `as` to
// override, e.g. as="h1" when the empty state is the only thing on the page.
const EMPTY_HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4']);

export function EmptyState({ title, body, cta, onCta, icon = 'inbox', compact, as }) {
  const Heading = EMPTY_HEADING_TAGS.has(as) ? as : compact ? 'h3' : 'h2';
  return (
    <div className="vu-screen" style={s(`padding:${compact ? '28px 20px' : '52px 32px'}`, 'text-align:center;display:flex;flex-direction:column;align-items:center')}>
      <div
        aria-hidden="true"
        style={S('width:44px;height:44px;border-radius:14px;background:#F6F2EE;display:grid;place-items:center;color:#C2603C')}
      >
        {renderIcon(icon, 20) || <Icon name="inbox" size={20} />}
      </div>
      <Heading style={S(`margin:16px 0 0;font:600 ${compact ? 16 : 19}px/1.25 Geist;letter-spacing:-0.025em;color:inherit`)}>{title}</Heading>
      <div style={S(`margin-top:8px;max-width:380px;font:450 ${compact ? 13 : 14}px/1.55 Geist;color:#6B635C;text-wrap:pretty`)}>{body}</div>
      {cta ? (
        <div style={S('margin-top:18px')}>
          <PrimaryButton onClick={onCta} h={40} px={18} r={11} fs={14}>
            {cta}
          </PrimaryButton>
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({ title = "This didn't load", body, retry = 'Try again', onRetry }) {
  return (
    <div role="alert" style={S('padding:40px 32px;text-align:center;display:flex;flex-direction:column;align-items:center')}>
      <div
        aria-hidden="true"
        style={S('width:44px;height:44px;border-radius:14px;background:#F5E7E0;display:grid;place-items:center;color:#A8482A')}
      >
        <Icon name="alert" size={20} />
      </div>
      <div style={S('margin-top:16px;font:600 19px/1.25 Geist;letter-spacing:-0.025em')}>{title}</div>
      <div style={S('margin-top:8px;max-width:400px;font:450 14px/1.55 Geist;color:#6B635C;text-wrap:pretty')}>{body}</div>
      {onRetry ? (
        <div style={S('margin-top:18px')}>
          <SecondaryButton onClick={onRetry} h={40} px={16} r={11} fs={14}>
            {retry}
          </SecondaryButton>
        </div>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ n = 3, h = 64 }) {
  return (
    <div style={S('display:flex;flex-direction:column;gap:10px')} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="vu-skel" style={S(`height:${h}px;border-radius:12px`)} />
      ))}
    </div>
  );
}

/** Small section heading. Sentence case on purpose: no mono caps eyebrows. */
export function SectionLabel({ children, color = '#6B635C' }) {
  return <div style={S(`font:600 13px/1.2 Geist;letter-spacing:-0.01em;color:${color}`)}>{children}</div>;
}
