'use client';

/* ==========================================================================
   LogHoursForm.jsx, one place a volunteer logs service they did on their own.
   Shared by the Home snapshot ("Log hours" button) and the Profile so both
   collect the same shape: what they did, the org, a cause category, the date,
   hours and a note. Writes through db.logHours, so the entry is stored as
   logged on your own (source "self"). No organization can confirm these: only
   hours logged against a project the volunteer joined on VolunteerU reach an
   organizer (see MemberProjects.jsx).
   ========================================================================== */

import { useId, useState } from 'react';
import { S, s, cx, H } from '../lib/style.js';
import { Field, TextArea, Select, Pressable } from './ui.jsx';
import { openModal, toast } from '../lib/overlays.js';
import { logHours, validateHours } from '../lib/db.js';
import { CAUSE_OPTIONS } from '../lib/createDraft.js';

const CATEGORY_OPTIONS = [
  { v: '', l: 'Choose a category' },
  ...CAUSE_OPTIONS.map((c) => ({ v: c, l: c })),
  { v: 'Community', l: 'Community' },
  { v: 'Other', l: 'Other' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local calendar date as YYYY-MM-DD (what <input type="date"> uses). */
export function isoToday(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** "2026-10-11" -> "Sat, Oct 11" (year added when it isn't this year). */
export function shortDateLabel(iso, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const base = `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/* How far back a self-logged date may go. High school is 4 years, so anything
   older than that is a typo (1990 instead of 2026), never real service. */
const MAX_YEARS_BACK = 4;

/**
 * A logged-hours date label back to a timestamp, for sorting. Reads the labels
 * shortDateLabel writes ("Sat, Oct 10", or "Sat, Oct 10, 2025" from another
 * year) and "Today". A label without a year is a date on or before today, so
 * the year is the latest one in range whose weekday matches the label.
 * Returns NaN for anything it can't read.
 */
export function logDateTime(label, now = new Date()) {
  const t = String(label || '').trim();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/^today$/i.test(t)) return today.getTime();
  const m = /^(?:([A-Z][a-z]{2}),?\s+)?([A-Z][a-z]{2})\s+(\d{1,2})(?:,\s*(\d{4}))?$/.exec(t);
  const mo = m ? MONTHS.indexOf(m[2]) : -1;
  if (!m || mo < 0) return NaN;
  const day = Number(m[3]);
  if (m[4]) return new Date(Number(m[4]), mo, day).getTime();
  const dow = m[1] ? DAYS.indexOf(m[1]) : -1;
  let fallback = NaN;
  for (let y = now.getFullYear(); y >= now.getFullYear() - MAX_YEARS_BACK; y--) {
    const d = new Date(y, mo, day);
    if (d.getMonth() !== mo || d > today) continue;
    if (Number.isNaN(fallback)) fallback = d.getTime();
    if (dow < 0 || d.getDay() === dow) return d.getTime();
  }
  return Number.isNaN(fallback) ? new Date(now.getFullYear(), mo, day).getTime() : fallback;
}

/** Newest first by date label; unreadable dates go last, ties keep their order. */
export function sortByLogDate(rows, now = new Date()) {
  return (rows || [])
    .map((r, i) => ({ r, i, at: logDateTime(r && r.date, now) }))
    .sort((x, y) => {
      const ax = Number.isNaN(x.at) ? -Infinity : x.at;
      const ay = Number.isNaN(y.at) ? -Infinity : y.at;
      return ay - ax || x.i - y.i;
    })
    .map((x) => x.r);
}

/** Earliest date a volunteer may log, as YYYY-MM-DD. */
export function isoEarliest(now = new Date()) {
  return isoToday(new Date(now.getFullYear() - MAX_YEARS_BACK, now.getMonth(), now.getDate()));
}

/**
 * Keep what the volunteer typed in the hours box, minus stray letters. A minus
 * sign survives (leading only) so "-2" reaches validation and gets a field
 * error instead of silently turning into 2.
 */
export function cleanHoursInput(v) {
  const t = String(v == null ? '' : v);
  const neg = t.trimStart().startsWith('-');
  return `${neg ? '-' : ''}${t.replace(/[^\d.]/g, '')}`.slice(0, 6);
}

/** Field errors for a log-hours draft. Pure, so it can be checked on its own. */
export function validateLogHours(f, today = isoToday(), earliest = isoEarliest()) {
  const e = {};
  if (!f.activity.trim()) e.activity = 'Enter what you did.';
  const hrsErr = validateHours(f.hrs);
  if (hrsErr) e.hrs = hrsErr;
  if (!f.date) e.date = 'Choose a date.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) e.date = 'Choose a date from the calendar.';
  else if (f.date > today) e.date = 'Choose today or an earlier date.';
  else if (f.date < earliest) e.date = `Choose a date in the last ${MAX_YEARS_BACK} years.`;
  return e;
}

function fmtHours(n) {
  const r = Math.round(Number(n) * 10) / 10;
  return `${r} ${r === 1 ? 'hour' : 'hours'}`;
}

function DateField({ label, value, onChange, min, max, error, required }) {
  const fid = useId();
  const eid = `${fid}-err`;
  return (
    <div>
      <label htmlFor={fid} style={S('display:block;font:500 12px/1 Geist;color:#57504A')}>
        {label}
        {required ? <span aria-hidden="true" style={S('color:#C2603C')}>{' *'}</span> : null}
      </label>
      <input
        id={fid}
        type="date"
        value={value}
        min={min}
        max={max}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        data-invalid={error ? 'true' : undefined}
        aria-describedby={error ? eid : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={H.input}
        style={S('margin-top:8px;display:block;width:100%;min-width:0;padding:11px 14px;border-radius:10px;border:1px solid #E8E1D9;background:#fff;font:450 15px/1.15 Geist;color:#1A1714;transition:border-color .16s ease')}
      />
      {error ? <div className="vu-err" id={eid}>{error}</div> : null}
    </div>
  );
}

export function LogHoursForm({ api, onDone }) {
  const today = isoToday();
  const [f, setF] = useState({ activity: '', org: '', category: '', date: today, hrs: '', note: '' });
  const [err, setErr] = useState({});
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  function save() {
    const e = validateLogHours(f, isoToday(), isoEarliest());
    setErr(e);
    if (Object.keys(e).length) return;
    let entry;
    try {
      entry = logHours({ ...f, date: shortDateLabel(f.date) });
    } catch (ex) {
      if (ex && ex.code === 'INVALID_HOURS') {
        setErr({ hrs: ex.message });
        return;
      }
      console.error('logHours failed', ex);
      toast({ title: "Couldn't log hours", message: 'Nothing was saved. Try again.', tone: 'danger' });
      return;
    }
    if (api && api.close) api.close();
    toast({ title: `Logged ${fmtHours(entry.hrs)}`, message: 'Added to your profile as logged on your own.', tone: 'ok' });
    if (onDone) onDone(entry);
  }

  return (
    <div>
      <Field
        label="What you did"
        value={f.activity}
        onChange={(v) => set('activity', v)}
        placeholder="e.g. Packed food boxes"
        maxLength={80}
        required
        error={err.activity}
      />
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field
          label="Organization (optional)"
          value={f.org}
          onChange={(v) => set('org', v)}
          placeholder="e.g. Riverbend Food Bank"
          maxLength={60}
        />
        <Select
          label="Category"
          value={f.category}
          onChange={(v) => set('category', v)}
          options={CATEGORY_OPTIONS}
        />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <DateField label="Date" value={f.date} onChange={(v) => set('date', v)} min={isoEarliest()} max={today} error={err.date} required />
        <Field
          label="Hours"
          value={f.hrs}
          onChange={(v) => set('hrs', cleanHoursInput(v))}
          placeholder="e.g. 2.5"
          inputMode="decimal"
          required
          error={err.hrs}
          hint="Up to 24 for one day"
        />
      </div>
      <div style={S('margin-top:14px')}>
        <TextArea
          label="Note (optional)"
          value={f.note}
          onChange={(v) => set('note', v)}
          placeholder="e.g. Sorted cans with the Saturday team"
          maxLength={240}
          minHeight={72}
          counter
        />
      </div>
      <div style={S('margin-top:14px;padding:11px 13px;border-radius:11px;background:#FDF3E7;border:1px solid #F3E3CD;font:450 12px/1.5 Geist;color:#8A5A20')}>
        Organizers can't confirm these. For a project you joined on VolunteerU, log hours from that project on Home so the organizer can confirm them.
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Pressable
          label="Cancel"
          onClick={() => api && api.close && api.close()}
          className={cx(H.secondary, H.press)}
          style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          Cancel
        </Pressable>
        <Pressable
          label="Log hours"
          onClick={save}
          className={cx(H.primary, H.press)}
          style={s('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          Log hours
        </Pressable>
      </div>
    </div>
  );
}

/** Open the log-hours form in the standard modal from anywhere. */
export function openLogHours(onDone) {
  openModal({
    title: 'Log your hours',
    subtitle: 'For volunteering you did outside VolunteerU.',
    Body: ({ api }) => <LogHoursForm api={api} onDone={onDone} />,
  });
}

export default LogHoursForm;
