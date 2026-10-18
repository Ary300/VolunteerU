'use client';

/* ==========================================================================
   MyRatings.jsx, what organizers said about this volunteer.
   Ratings are written by an organizer on the volunteer's application
   (CrossMembers.jsx); notes come from state.leadFeedback. Profile passes both
   in (it already loaded the applications); used on its own it loads ratings.
   Renders nothing until there is at least one rating or note.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import { loadMyRatings } from '../lib/listings.js';
import { Sep } from './vu/ListingCard.jsx';

/** Meta parts joined with the house separator (an ink3 middle dot). */
function metaLine(parts) {
  const list = parts.filter(Boolean);
  return list.length ? list.map((p, i) => <span key={i}>{i ? <Sep /> : null}{p}</span>) : null;
}

/** Ratings from already-loaded applications, newest first (same rule as loadMyRatings). */
export function ratingsFrom(apps) {
  return (apps || [])
    .filter((a) => a.assignment && a.assignment.rating && a.assignment.rating.stars)
    .map((a) => ({ ...a.assignment.rating, org: (a.listings && a.listings.name) || 'A project', cause: a.listings && a.listings.cause }))
    .sort((x, y) => String(y.ratedAt || '').localeCompare(String(x.ratedAt || '')));
}

export function averageStars(ratings) {
  if (!ratings || !ratings.length) return 0;
  return ratings.reduce((t, r) => t + Number(r.stars || 0), 0) / ratings.length;
}

/** An average as people say it: 5 -> "5", 4.666 -> "4.7". */
export function starsLabel(avg) {
  const r = Math.round(Number(avg || 0) * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "Oct 10" from an ISO timestamp, or '' when it can't be read. */
function shortDate(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}

/* One note as a plain row: what happened, the organizer's words, then meta. */
function NoteRow({ lead, text, meta }) {
  return (
    <li className="vu-pf-note" style={S(`padding:18px 0;border-top:1px solid ${C.line};min-width:0`)}>
      {lead ? <div style={S(`font:600 15px/1.4 ${F.body};color:${C.ink}`)}>{lead}</div> : null}
      {text ? (
        <blockquote className="vu-break" style={S(`margin:${lead ? '6px' : '0'} 0 0;max-width:640px;font:400 15px/1.55 ${F.body};color:${C.ink}`)}>{text}</blockquote>
      ) : null}
      {meta ? <div style={S(`margin-top:6px;font:400 13px/1.4 ${F.body};color:${C.ink2}`)}>{meta}</div> : null}
    </li>
  );
}

/**
 * @param {object} props
 * @param {Array} [props.ratings] from ratingsFrom(); omitted, the block loads its own
 * @param {Array} [props.notes]   state.leadFeedback rows { id, t, who, when }
 * @param {string} [props.headingId]
 */
export default function MyRatings({ ratings: given, notes = [], headingId = 'vu-ratings-h' } = {}) {
  const controlled = given !== undefined;
  const [own, setOwn] = useState(null);
  useEffect(() => {
    if (controlled) return undefined;
    let live = true;
    loadMyRatings()
      .then((r) => { if (live) setOwn(r); })
      .catch((e) => {
        console.error('loadMyRatings failed', e);
        if (live) setOwn([]);
      });
    return () => { live = false; };
  }, [controlled]);

  const ratings = (controlled ? given : own) || [];
  const list = notes || [];
  if (!ratings.length && !list.length) return null;
  const avg = averageStars(ratings);

  return (
    <div>
      <div className="vu-sec-head" style={S('display:flex;align-items:baseline;justify-content:space-between;gap:8px 16px;flex-wrap:wrap')}>
        <h2 id={headingId} style={S(`margin:0;font:650 24px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`)}>Notes from organizers</h2>
        {ratings.length ? (
          <span style={S(`font:400 14px/1.3 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>
            {ratings.length === 1 ? '' : 'Average '}{starsLabel(avg)} out of 5 from {ratings.length} {ratings.length === 1 ? 'rating' : 'ratings'}
          </span>
        ) : null}
      </div>
      <ul style={S(`margin:14px 0 0;padding:0;list-style:none;border-bottom:1px solid ${C.line}`)}>
        {ratings.slice(0, 6).map((r, i) => (
          <NoteRow
            key={`r-${r.org}-${r.ratedAt || ''}-${i}`}
            lead={`${r.org} rated you ${Number(r.stars)} out of 5`}
            text={r.note || ''}
            meta={metaLine([r.reliability, shortDate(r.ratedAt)])}
          />
        ))}
        {list.map((f) => (
          <NoteRow key={`n-${f.id}`} text={f.t} meta={metaLine([f.who, f.when])} />
        ))}
      </ul>
    </div>
  );
}

