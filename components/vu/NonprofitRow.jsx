'use client';

/* ==========================================================================
   NonprofitRow, a directory row the way ProPublica or Idealist show one:
   the name, then "Food and hunger · Carmel, IN", a trailing chevron (or an
   external-link mark), and a 1px rule. App rows link to the nonprofit's own
   page, /nonprofits/<ein>. No logo or initials square: we don't
   have their logos and won't invent one.

   Lay several out in two columns on wide screens with className
   "vu-np-grid" on the parent; the grid draws the top rule of each column.
   Say where the records come from once per section, never per row.
   ========================================================================== */

import Link from 'next/link';
import { S } from '../../lib/style.js';
import { C, F } from '../../lib/tokens.js';
import { Icon } from '../ui.jsx';

const SKIP = new Set(['inc', 'inc.', 'of', 'the', 'and', '&', 'for', 'a', 'an', 'llc', 'corp', 'co', 'foundation']);

/** "Gleaners Food Bank of Indiana Inc" -> "GF". */
export function monogram(name) {
  const words = String(name || '')
    .replace(/[^\p{L}\p{N}&\s.-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const keep = words.filter((w) => !SKIP.has(w.toLowerCase()));
  const src = keep.length ? keep : words;
  return (src.slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
}

/**
 * Neutral initials square: white, a 1px line, ink2 letters. Only for a page
 * header that needs an anchor; rows never carry one. `cause` is accepted
 * for older callers and no longer tints it.
 */
// eslint-disable-next-line no-unused-vars
export function Monogram({ name, cause, size = 44 }) {
  return (
    <span
      aria-hidden="true"
      style={S(
        `width:${size}px;height:${size}px;border-radius:10px;flex:none;display:grid;place-items:center;background:#fff;box-shadow:inset 0 0 0 1px ${C.line};color:${C.ink2};font:600 ${Math.round(size * 0.34)}px/1 ${F.body}`
      )}
    >
      {monogram(name)}
    </span>
  );
}

/* Generic causes the directory falls back to; they say nothing, so they're dropped. */
const GENERIC = /^(nonprofit|human services|other|general)$/i;

/**
 * Sub line parts with middle dots. `sub` may be a string ("Food and hunger,
 * Carmel, IN" or "Food and hunger · Carmel, IN") or build it from `parts`.
 */
function subParts(sub, parts) {
  if (Array.isArray(parts)) return parts.map((x) => String(x || '').trim()).filter((x) => x && !GENERIC.test(x));
  const t = String(sub || '').trim();
  if (!t) return [];
  if (t.includes(' · ')) return t.split(' · ').map((x) => x.trim()).filter((x) => x && !GENERIC.test(x));
  // "Cause, City, ST": the last two pieces are the place.
  const bits = t.split(/,\s*/).filter(Boolean);
  if (bits.length >= 3 && /^[A-Z]{2}$/.test(bits[bits.length - 1])) {
    const place = bits.slice(-2).join(', ');
    const cause = bits.slice(0, -2).join(', ');
    return [cause, place].filter((x) => x && !GENERIC.test(x));
  }
  return [t];
}

/**
 * @param {object} props
 * @param {string} props.name
 * @param {string} [props.sub]        "Food and hunger, Carmel, IN" (a "Cause, City, ST" string is split into cause · place)
 * @param {string[]} [props.parts]    or the sub line as parts: [causeLabel, 'Carmel, IN']
 * @param {number} [props.openCount]  a VolunteerU org's open listings, from data: "3 open"
 * @param {string} [props.href]       renders a link; otherwise pass onClick for a button
 * @param {()=>void} [props.onClick]  with href, runs just before the link navigates
 * @param {boolean} [props.external]  opens in a new tab with the external mark
 * @param {React.ReactNode} [props.trailing] replaces the chevron (a button, a status)
 * @param {string} [props.note]       a last, quieter part of the sub line, e.g. "Not on the map"
 * @param {(on: boolean)=>void} [props.onHover] pointer or keyboard focus enters (true) or leaves (false), for a map beside the list
 * @param {string} [props.cause]      accepted for older callers; unused
 */
// eslint-disable-next-line no-unused-vars
export default function NonprofitRow({ name, sub, parts, openCount, cause, href, onClick, trailing, external = false, className, note, onHover }) {
  const meta = subParts(sub, parts);
  const hoverProps = onHover
    ? { onPointerEnter: () => onHover(true), onPointerLeave: () => onHover(false), onFocus: () => onHover(true), onBlur: () => onHover(false) }
    : {};
  const n = Number(openCount);
  const body = (
    <>
      <span style={S('min-width:0;flex:1')}>
        <span className="vu-np-name vu-trunc">{name}</span>
        {meta.length || note ? (
          <span className="vu-np-sub vu-trunc">
            {meta.map((m, i) => (
              <span key={i}>
                {i ? (
                  <span className="vu-sep" aria-hidden="true">
                    {' · '}
                  </span>
                ) : null}
                {m}
              </span>
            ))}
            {note ? (
              <span className="vu-np-note">
                {meta.length ? (
                  <span className="vu-sep" aria-hidden="true">
                    {' · '}
                  </span>
                ) : null}
                {note}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      {trailing !== undefined ? (
        trailing
      ) : (
        <span className="vu-np-end">
          {Number.isFinite(n) && n > 0 ? <span className="vu-np-open">{n} open</span> : null}
          <span className="vu-np-chev" aria-hidden="true">
            <Icon name={external ? 'external' : 'chevron-right'} size={external ? 16 : 18} />
          </span>
        </span>
      )}
    </>
  );
  const cls = ['vu-np', className].filter(Boolean).join(' ');
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...hoverProps}>
        {body}
      </a>
    );
  }
  if (href) {
    // onClick runs before the navigation (a list remembers its scroll there).
    return (
      <Link href={href} className={cls} onClick={onClick} {...hoverProps}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} {...hoverProps}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} {...hoverProps}>
      {body}
    </div>
  );
}
