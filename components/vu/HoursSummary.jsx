'use client';

/* ==========================================================================
   HoursSummary, one big number for confirmed hours and one stacked bar
   (confirmed, waiting, logged on your own). On the profile (lg) the rest is
   one sentence under the bar; the Home rail (sm) keeps a short stacked
   legend. Replaces rows of identical stat cards. Pass real numbers only.
   ========================================================================== */

import { S } from '../../lib/style.js';
import { C, F } from '../../lib/tokens.js';

/** 3 -> "3", 2.5 -> "2.5", 2.456 -> "2.5". One decimal at most. */
export function fmtHours(n) {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
const hoursWord = (n) => `${fmtHours(n)} ${Number(fmtHours(n)) === 1 ? 'hour' : 'hours'}`;

/**
 * @param {object} props
 * @param {number} props.confirmed  hours confirmed by organizations
 * @param {number} [props.waiting]  hours waiting on an organization
 * @param {number} [props.own]      hours logged on your own (no organization)
 * @param {'lg'|'sm'} [props.size]  lg: profile (88px number, 72px on phones, one sentence under the bar); sm: home rail (44px, legend stacked)
 * @param {string} [props.caption]  text beside the number
 * @param {{confirmed?:string,waiting?:string,own?:string}} [props.labels] legend wording
 * @param {React.ReactNode} [props.action] e.g. a "Log hours" button under the legend
 * @param {string} [props.emptyTitle] heading when nothing is confirmed yet (default "No confirmed hours yet")
 *
 * With 0 confirmed there's no giant 0: a heading, then one sentence with the
 * waiting and own hours that exist, and the bar only when there are some.
 */
export default function HoursSummary({ confirmed = 0, waiting = 0, own = 0, size = 'lg', caption, labels = {}, action, emptyTitle, className }) {
  const lg = size === 'lg';
  const L = {
    confirmed: labels.confirmed || (lg ? 'confirmed' : 'confirmed by organizations'),
    waiting: labels.waiting || (lg ? 'waiting on an organizer' : 'waiting on an organization'),
    own: labels.own || 'logged on your own',
  };
  const cap = caption !== undefined ? caption : lg ? 'hours confirmed by organizers this school year' : Number(fmtHours(confirmed)) === 1 ? 'hour confirmed' : 'hours confirmed';
  const segs = [
    { k: 'confirmed', v: Math.max(0, Number(confirmed) || 0), color: C.confirmed },
    { k: 'waiting', v: Math.max(0, Number(waiting) || 0), color: C.waitingBar },
    { k: 'own', v: Math.max(0, Number(own) || 0), color: C.ownBar },
  ];
  const total = segs.reduce((a, x) => a + x.v, 0);
  const rest = segs.filter((x) => x.k !== 'confirmed' && x.v > 0);
  const none = !(Number(fmtHours(segs[0].v)) > 0);
  const legend = segs.filter((x) => x.v > 0 || x.k === 'confirmed' || (x.k === 'waiting' && lg));
  const summary = segs
    .filter((x) => x.v > 0)
    .map((x) => `${hoursWord(x.v)} ${L[x.k]}`)
    .join(', ') || 'No hours yet';

  const bar = (
    <div role="img" aria-label={summary} style={S(`display:flex;gap:3px;height:${lg ? 10 : 8}px;margin-top:${none ? 14 : lg ? 24 : 14}px;border-radius:${lg ? 5 : 4}px;overflow:hidden`)}>
      {segs
        .filter((x) => x.v > 0)
        .map((x) => <i key={x.k} style={{ display: 'block', height: '100%', flex: `${x.v} 1 0`, background: x.color }} />)}
    </div>
  );

  if (none) {
    return (
      <div className={className}>
        <h3 style={S(`margin:0;font:600 ${lg ? 20 : 17}px/1.2 ${F.display};letter-spacing:-0.012em;color:${C.ink}`)}>{emptyTitle || 'No confirmed hours yet'}</h3>
        {rest.length ? (
          <p style={S(`margin:6px 0 0;font:400 14px/1.45 ${F.body};color:${C.ink2}`)}>
            {rest.map((x, i) => (
              <span key={x.k}>
                {i ? <span className="vu-sep" aria-hidden="true">{' · '}</span> : null}
                <span style={S('font-variant-numeric:tabular-nums')}>{hoursWord(x.v)}</span> {x.k === 'waiting' ? 'waiting on an organizer' : L.own}
              </span>
            ))}
          </p>
        ) : null}
        {total > 0 ? bar : <span role="img" aria-label={summary} className="vu-sr" />}
        {/* The number for assistive tech and tools that read the summary; the
            heading already says it to sighted readers, without a giant 0. */}
        <b className="vu-sr">0</b>
        {action ? <div style={S(`margin-top:${lg ? 20 : 16}px`)}>{action}</div> : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <div style={S(`display:flex;align-items:${lg ? 'flex-end' : 'baseline'};gap:${lg ? 18 : 10}px;flex-wrap:wrap`)}>
        <b
          className={lg ? 'vu-hours-big' : undefined}
          style={S(
            lg
              ? `font:800 88px/.82 ${F.display};letter-spacing:-0.05em;color:${C.ink};font-variant-numeric:tabular-nums`
              : `font:700 44px/1 ${F.display};letter-spacing:-0.03em;color:${C.ink};font-variant-numeric:tabular-nums`
          )}
        >
          {fmtHours(confirmed)}
        </b>
        {cap ? <span style={S(lg ? `font:500 17px/1.3 ${F.body};color:${C.ink2};padding-bottom:4px;max-width:300px` : `font:400 15px/1.3 ${F.body};color:${C.ink2}`)}>{cap}</span> : null}
      </div>

      {bar}

      {lg ? (
        /* The big number already says the confirmed hours, so under the bar
           comes one sentence with the rest (only parts above 0). Each part
           leads with a dot in its bar color so the bar still reads. */
        rest.length ? (
          <p style={S(`margin:12px 0 0;font:400 14px/1.45 ${F.body};color:${C.ink2}`)}>
            {rest.map((x, i) => (
              <span key={x.k}>
                {i ? <span className="vu-sep" aria-hidden="true">{' · '}</span> : null}
                <i aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6, verticalAlign: '1px', background: x.color }} />
                <span style={S('font-variant-numeric:tabular-nums')}>{hoursWord(x.v)}</span> {L[x.k]}
              </span>
            ))}
          </p>
        ) : null
      ) : (
        <div style={S(`display:grid;gap:6px;margin-top:12px;font:400 13px/1.3 ${F.body};color:${C.ink2}`)}>
          {legend.map((x) => (
            <span key={x.k} style={S('display:flex;gap:8px;align-items:center')}>
              <i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, display: 'block', flex: 'none', background: x.color }} />
              <span>
                <span style={S('font-variant-numeric:tabular-nums')}>{fmtHours(x.v)}</span> {L[x.k]}
              </span>
            </span>
          ))}
        </div>
      )}
      {action ? <div style={S(`margin-top:${lg ? 20 : 16}px`)}>{action}</div> : null}
    </div>
  );
}
