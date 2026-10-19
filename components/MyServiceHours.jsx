'use client';

/* ==========================================================================
   MyServiceHours.jsx, the dated shift table on the profile.
   One row per shift, newest first: hours logged on a project the volunteer
   joined (confirmed by the organizer, or waiting on them) and hours logged on
   their own from the Log hours form. Profile builds the rows (shiftRows) and
   owns the filters; this file only draws them. Also here: "Where you've
   helped" (one row per project joined, with its shifts and hours), the empty
   row and Attendance.
   ========================================================================== */

import Link from 'next/link';
import { S } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import { Icon, Button, StatusText, IconButton } from './ui.jsx';
import DateBlock from './vu/DateBlock.jsx';
import { Sep } from './vu/ListingCard.jsx';
import { pickPhotos } from '../lib/photos.js';
import { fmtRange } from '../lib/format.js';
import { shiftDates } from '../lib/calendar.js';
import { myShiftSignUps } from '../lib/listings.js';
import { logDateTime, sortByLogDate, causeLabel } from './LogHoursForm.jsx';

/** 1 -> "1 hr", 2.5 -> "2.5 hrs". */
export function hrsShort(n) {
  const r = Math.round(Number(n || 0) * 10) / 10;
  return `${r} ${r === 1 ? 'hr' : 'hrs'}`;
}

const r1 = (n) => Math.round(Number(n || 0) * 10) / 10;

const STATUS = {
  confirmed: { tone: 'ok', label: 'Confirmed' },
  waiting: { tone: 'wait', label: 'Waiting' },
  declined: { tone: 'mute', label: 'Not confirmed' },
  own: { tone: 'mute', label: 'Logged on your own' },
};

/* "9:00-12:00 PM" -> "9 AM to 12 PM", "9 AM–noon" -> "9 AM to noon": the house
   format, never a dash between two times. */
function timeText(t) {
  const s = String(t || '').trim();
  const f = fmtRange(s);
  return f && (/ to /.test(f) || !/[–—-]/.test(s)) ? f : s.replace(/\s*[–—-]\s*/g, ' to ');
}

/* A shift the organizer posted from Attendance is stored as "Shift, 10 AM–noon".
   Its row is titled with the project's name and the time goes in the meta line. */
function serviceTitle(e) {
  const m = e.source === 'attendance' ? /^Shift(?:,\s*(.+))?$/.exec(String(e.activity || 'Shift').trim()) : null;
  if (m && e.org) return { title: e.org, org: '', time: timeText(m[1]) };
  return { title: e.activity || e.name || 'Shift', org: e.org, time: '' };
}

/**
 * Project hours (Profile.summarizeService entries) and hours logged on your
 * own (state.hoursLog), as one list of rows, newest first.
 */
export function shiftRows(serviceEntries, hoursLog) {
  const rows = [
    ...(serviceEntries || []).map((e) => ({
      key: `svc-${e.id}`,
      date: e.date,
      ...serviceTitle(e),
      cause: e.cause || '',
      hrs: Number(e.hrs) || 0,
      status: e.verified ? 'confirmed' : e.declined ? 'declined' : 'waiting',
      source: 'project',
      // Hours the volunteer logged on a joined project can come off until the
      // organizer confirms them (same rule as My crew). Shifts the organizer
      // posted from Attendance, and confirmed hours, can't.
      removable: !e.verified && e.source !== 'attendance' && !!e.applicationId && !!e.hourId,
      raw: e,
    })),
    ...(hoursLog || []).map((h) => ({
      key: `own-${h.id}`,
      date: h.date,
      title: h.name || 'Hours',
      org: h.org,
      cause: h.category || '',
      category: h.category || '',
      hrs: Number(h.hrs) || 0,
      status: 'own', // the volunteer's own entry; only an organizer's assignment confirms hours
      source: 'self',
      removable: true,
      raw: h,
    })),
  ];
  return sortByLogDate(rows);
}

/** Organizations the volunteer joined, with their shifts and hours, for "Where you've helped". */
export function helpedPlaces(apps, serviceEntries, hoursLog = []) {
  const joined = (apps || [])
    .filter((a) => a.status === 'accepted' && a.listings)
    .map((a) => {
      const mine = (serviceEntries || []).filter((e) => e.applicationId === a.id && !e.declined);
      const ok = r1(mine.filter((e) => e.verified).reduce((t, e) => t + e.hrs, 0));
      const wait = r1(mine.filter((e) => !e.verified).reduce((t, e) => t + e.hrs, 0));
      const parts = mine.length
        ? [`${mine.length} ${mine.length === 1 ? 'shift' : 'shifts'}`, ok ? `${hrsShort(ok)} confirmed` : null, wait ? `${hrsShort(wait)} waiting` : null].filter(Boolean)
        : ['Joined, no hours logged yet'];
      return { id: a.listing_id || a.id, name: a.listings.name || 'A project', cause: a.listings.cause || '', cover: a.listings.cover || '', live: !a.listings.unlisted && !!a.listing_id, parts, line: parts.join(', '), weight: mine.length };
    });
  // Organizations from hours logged on your own count on the profile too, so
  // they get a row (no link: they aren't VolunteerU listings).
  const key = (v) => String(v || '').trim().toLowerCase();
  const known = new Set(joined.map((p) => key(p.name)));
  const own = new Map();
  for (const h of hoursLog || []) {
    const k = key(h.org);
    if (!k || known.has(k)) continue;
    const cur = own.get(k) || { name: String(h.org).trim(), n: 0, hrs: 0 };
    cur.n += 1;
    cur.hrs += Number(h.hrs) || 0;
    own.set(k, cur);
  }
  const ownRows = [...own.entries()].map(([k, o]) => {
    const parts = [`${o.n} ${o.n === 1 ? 'shift' : 'shifts'}`, `${hrsShort(r1(o.hrs))} logged on your own`];
    return { id: `own:${k}`, name: o.name, cause: '', cover: '', live: false, parts, line: parts.join(', '), weight: o.n };
  });
  return [...joined, ...ownRows]
    .sort((x, y) => y.weight - x.weight)
    .slice(0, HELPED_MAX);
}

const HELPED_MAX = 6;

/** Join meta parts with the house separator (an ink3 middle dot). */
function withSeps(parts) {
  return parts.filter(Boolean).map((p, i) => (
    <span key={i}>{i ? <Sep /> : null}{p}</span>
  ));
}

/** The label's date as a Date for the DateBlock ("Today" included), or null. */
function rowDate(label) {
  const t = logDateTime(label);
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * "Where you've helped": one row per project the volunteer joined. A row leads
 * with the listing's own cover when it has one (no stock stand-in, no tile) and
 * opens the listing while it is still live.
 */
export function Helped({ places }) {
  const photos = pickPhotos(places, { seed: false });
  return (
    <ul className="vu-list" style={S('margin:16px 0 0;padding:0;list-style:none')}>
      {places.map((p) => {
        const ph = photos.get(p.id);
        const cls = `vu-row${ph ? '' : ' vu-row--nolead'}`;
        const inner = (
          <>
            {ph ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="vu-row-thumb" src={ph.sm || ph.src} alt="" loading="lazy" style={{ objectPosition: ph.pos }} />
            ) : null}
            <div style={S('min-width:0')}>
              <h3 className="vu-row-t" style={S('margin:0')}>{p.name}</h3>
              <span className="vu-row-m">{withSeps(p.parts || [p.line])}</span>
            </div>
            {p.live ? (
              <span className="vu-row-end vu-hide-mobile" aria-hidden="true" style={S(`color:${C.ink3}`)}>
                <Icon name="chevron-right" size={18} />
              </span>
            ) : null}
          </>
        );
        return (
          <li key={p.id}>
            {p.live ? (
              <Link href={`/join/${p.id}`} className={cls} style={S(`color:inherit;text-decoration:none`)}>{inner}</Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* Applications that can hold shift sign-ups (same rule as Home's Upcoming:
   a pending applicant can sign up before the organizer answers). */
const SIGNUP_STATUSES = ['pending', 'accepted'];

/** The date label ("Sat, Oct 24") of the volunteer's soonest shift sign-up
    that hasn't ended, or '' when there is none. */
export function nextSignUpDate(apps, now = new Date()) {
  let best = null;
  for (const a of apps || []) {
    if (!a || !a.listings || a.listings.unlisted || !SIGNUP_STATUSES.includes(a.status)) continue;
    for (const sh of myShiftSignUps(a, now)) {
      if (sh.past || !sh.d) continue;
      const dts = shiftDates(sh, undefined, now);
      const at = dts ? dts.start.getTime() : Number.MAX_SAFE_INTEGER;
      if (!best || at < best.at) best = { at, d: String(sh.d) };
    }
  }
  return best ? best.d : '';
}

/**
 * The Shifts empty state: a title and one sentence, no buttons. The Log hours
 * button in the Your hours heading right above it and the Applications empty
 * state below it already carry the two actions.
 * @param {object} props
 * @param {string} [props.isolated] cause filter in effect
 * @param {string} [props.nextShift] date of the volunteer's next shift
 *   sign-up ("Sat, Oct 24"); the row then points at that shift instead of
 *   asking them to sign up for one
 */
export function NoShifts({ isolated, nextShift = '' }) {
  const upcoming = !isolated && nextShift;
  const title = isolated ? `No shifts in ${isolated}` : upcoming ? 'No hours logged yet' : 'No shifts yet';
  const body = isolated
    ? 'Pick another cause, or show all causes.'
    : upcoming
      ? `Your next shift is ${nextShift}. Log your hours after it and they show up here.`
      : 'Hours you log after a shift show up here, newest first.';
  return (
    <div style={S(`margin-top:14px;padding:20px 0;border-top:1px solid ${C.line}`)}>
      <div style={S(`font:600 16px/1.3 ${F.body};color:${C.ink}`)}>{title}</div>
      <p style={S(`margin:4px 0 0;font:400 14px/1.45 ${F.body};color:${C.ink2}`)}>{body}</p>
    </div>
  );
}

export function Attendance({ rows }) {
  return (
    <div style={S('margin-top:36px')}>
      <h3 style={S(`margin:0;font:600 19px/1.2 ${F.display};letter-spacing:-0.01em;color:${C.ink}`)}>Attendance</h3>
      <div className="vu-table-wrap" style={S('margin-top:10px')}>
        <table style={S(`width:100%;min-width:520px;border-collapse:collapse;font:400 14px/1.4 ${F.body};color:${C.ink}`)}>
          <thead>
            <tr style={S(`text-align:left;color:${C.ink2};font:600 13px/1.2 ${F.body}`)}>
              {['Date', 'Project', 'Arrival', 'Hours', 'Score'].map((h) => <th key={h} scope="col" style={S(`padding:10px 12px 10px 0;border-bottom:1px solid ${C.line};font-weight:600`)}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td style={S(`padding:12px 12px 12px 0;border-bottom:1px solid ${C.line};color:${C.ink2};white-space:nowrap`)}>{x.d}</td>
                <td style={S(`padding:12px 12px 12px 0;border-bottom:1px solid ${C.line};font-weight:600`)}>{x.p}</td>
                <td style={S(`padding:12px 12px 12px 0;border-bottom:1px solid ${C.line};color:${C.ink2}`)}>{x.st}</td>
                <td style={S(`padding:12px 12px 12px 0;border-bottom:1px solid ${C.line};font-variant-numeric:tabular-nums`)}>{x.hrs}</td>
                <td style={S(`padding:12px 0;border-bottom:1px solid ${C.line}`)}>{x.grade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShiftRow({ row, onRemove }) {
  const st = STATUS[row.status] || STATUS.own;
  const d = rowDate(row.date);
  // The DateBlock carries the weekday, day and month, so the meta line holds
  // only the time and org (and the raw date only when there's no DateBlock).
  const meta = [row.time, row.org, d ? '' : row.date].filter(Boolean);
  return (
    <li className="vu-pf-shift" style={S(`border-bottom:1px solid ${C.line}`)}>
      <span className="vu-pf-shift-date">
        {d ? <DateBlock date={d} month /> : <span aria-hidden="true" style={S('display:block;width:56px')} />}
      </span>
      <div className="vu-pf-shift-main" style={S('min-width:0')}>
        <div className="vu-row-t">{row.title}</div>
        {meta.length ? <div className="vu-row-m">{withSeps(meta)}</div> : null}
        {row.category ? <div className="vu-row-m">{causeLabel(row.category)}</div> : null}
        {/* Why the organizer didn't confirm it, or that Attendance already counted the day. */}
        {row.status === 'declined' && row.raw && row.raw.declineNote ? <div className="vu-row-m">{row.raw.declineNote}</div> : null}
      </div>
      <span className="vu-pf-shift-hrs vu-row-num">
        {hrsShort(row.hrs)}
      </span>
      <span className="vu-pf-shift-status">
        <StatusText tone={st.tone}>{st.label}</StatusText>
      </span>
      <span className="vu-pf-shift-act vu-noprint">
        {row.removable && onRemove ? (
          <IconButton icon="trash" iconSize={17} label={`Remove ${row.title}, ${hrsShort(row.hrs)}`} onClick={() => onRemove(row)} />
        ) : null}
      </span>
    </li>
  );
}

/**
 * @param {object} props
 * @param {Array} props.rows             from shiftRows(), already filtered
 * @param {number} props.total           rows before the preview cut
 * @param {boolean} props.showAll
 * @param {() => void} props.onToggleAll
 * @param {(row: object) => void} [props.onRemove] gets the whole row (row.source, row.raw)
 * @param {boolean} [props.error]        project hours failed to load
 * @param {() => void} [props.onRetry]
 * @param {React.ReactNode} [props.empty] shown when there are no rows
 */
export default function MyServiceHours({ rows = [], total = 0, showAll, onToggleAll, onRemove, error, onRetry, empty, preview = 6 }) {
  return (
    <div>
      {error ? (
        <div role="alert" style={S(`display:flex;align-items:center;justify-content:space-between;gap:12px 20px;flex-wrap:wrap;margin-top:16px;font:400 14px/1.45 ${F.body};color:${C.ink}`)}>
          <span style={S('display:inline-flex;gap:8px;align-items:flex-start;min-width:0')}>
            <span style={S(`color:${C.emberDeep};display:inline-flex;margin-top:2px`)}><Icon name="alert" size={16} /></span>
            <span>We couldn't load hours from your projects. Check your connection and try again.</span>
          </span>
          {onRetry ? (
            <Button size="sm" variant="outline" icon="refresh" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
      {rows.length === 0 ? (
        empty || null
      ) : (
        <ul style={S(`margin:8px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
          {rows.map((r) => (
            <ShiftRow key={r.key} row={r} onRemove={onRemove} />
          ))}
        </ul>
      )}
      {total > preview ? (
        <div className="vu-noprint" style={S('margin-top:16px')}>
          <Button variant="ghost" size="sm" onClick={onToggleAll} aria-label={showAll ? 'Show fewer shifts' : `Show all ${total} shifts`} extra="padding:0;border:0">
            {showAll ? 'Show fewer' : `Show all ${total}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
