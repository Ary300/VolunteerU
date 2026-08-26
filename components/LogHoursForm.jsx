'use client';

/* ==========================================================================
   LogHoursForm.jsx, one place a volunteer logs service they did on their own.
   Shared by the Home snapshot ("Log hours" button) and the Profile record so
   both collect the same shape: what they did, the org, a cause category, the
   date, hours and a note. Writes through db.logHours → the entry lands in the
   record as self-reported and rolls into "Pending verification" until an
   organization confirms it.
   ========================================================================== */

import { useState } from 'react';
import { S, s, cx, H } from '../lib/style.js';
import { Field, TextArea, Select, Pressable } from './ui.jsx';
import { openModal, toast } from '../lib/overlays.js';
import { logHours } from '../lib/db.js';
import { CAUSE_OPTIONS } from '../lib/createDraft.js';

const CATEGORY_OPTIONS = [
  { v: '', l: 'Choose a category' },
  ...CAUSE_OPTIONS.map((c) => ({ v: c, l: c })),
  { v: 'Community', l: 'Community' },
  { v: 'Other', l: 'Other' },
];

export function LogHoursForm({ api, onDone }) {
  const [f, setF] = useState({ activity: '', org: '', category: '', date: '', hrs: '', note: '' });
  const [err, setErr] = useState({});

  function save() {
    const e = {};
    if (!f.activity.trim()) e.activity = 'What did you do?';
    const n = Number(f.hrs);
    if (!n || n <= 0 || n > 24) e.hrs = 'Enter hours between 0 and 24.';
    setErr(e);
    if (Object.keys(e).length) return;
    const entry = logHours(f);
    if (api && api.close) api.close();
    toast({ title: 'Hours logged', message: 'Saved to your record as self-reported.', tone: 'ok' });
    if (onDone) onDone(entry);
  }

  return (
    <div>
      <Field
        label="What you did"
        value={f.activity}
        onChange={(v) => setF((x) => ({ ...x, activity: v }))}
        placeholder="e.g. Tutored reading, packed food boxes"
        maxLength={80}
        required
        error={err.activity}
      />
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field
          label="Organization (optional)"
          value={f.org}
          onChange={(v) => setF((x) => ({ ...x, org: v }))}
          placeholder="Who you helped"
          maxLength={60}
        />
        <Select
          label="Category"
          value={f.category}
          onChange={(v) => setF((x) => ({ ...x, category: v }))}
          options={CATEGORY_OPTIONS}
        />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field
          label="Date"
          value={f.date}
          onChange={(v) => setF((x) => ({ ...x, date: v }))}
          placeholder="e.g. Aug 9"
          maxLength={20}
        />
        <Field
          label="Hours"
          value={f.hrs}
          onChange={(v) => setF((x) => ({ ...x, hrs: v.replace(/[^\d.]/g, '').slice(0, 5) }))}
          placeholder="e.g. 2.5"
          inputMode="decimal"
          required
          error={err.hrs}
        />
      </div>
      <div style={S('margin-top:14px')}>
        <TextArea
          label="Note (optional)"
          value={f.note}
          onChange={(v) => setF((x) => ({ ...x, note: v }))}
          placeholder="What you actually did, who you worked with, anything worth remembering"
          maxLength={240}
          minHeight={72}
          counter
        />
      </div>
      <div style={S('margin-top:14px;padding:11px 13px;border-radius:11px;background:#FDF3E7;border:1px solid #F3E3CD;font:450 12px/1.5 Geist;color:#8A5A20')}>
        Logged hours are self-reported until an organization confirms them. Confirmed hours count on your verified record.
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
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
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
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
    subtitle: 'Add service you have done. It saves to your account; an organization can confirm it later.',
    Body: ({ api }) => <LogHoursForm api={api} onDone={onDone} />,
  });
}

export default LogHoursForm;
