'use client';

/* ==========================================================================
   VolunteerApplications.jsx, a volunteer's own applications
   Everything they applied to, where each one stands, and a way to message
   the organizer. Renders nothing until they've applied to something, unless
   `showEmpty` asks for the empty state.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { S, cx, H } from '../lib/style.js';
import { loadMyApplications } from '../lib/listings.js';
import { openModal } from '../lib/overlays.js';
import MessageThread from './MessageThread.jsx';
import { APPLICATION_STATUS as STATUS_WORDS } from '../lib/seed.js';

const MONO = "'Geist Mono',monospace";
// Words from lib/seed.js (shared with the lead's screens); chip colors kept
// here so the withdrawn chip text stays at AA contrast.
const CHIP_COLORS = {
  pending: { bg: '#FDF3E7', color: '#8A5A20' },
  accepted: { bg: '#EAF3EC', color: '#3F6B4E' },
  declined: { bg: '#F5E7E0', color: '#A8482A' },
  withdrawn: { bg: '#F6F2EE', color: '#6B635C' },
};
export const APPLICATION_STATUS = Object.fromEntries(
  Object.entries(CHIP_COLORS).map(([k, c]) => [k, { label: STATUS_WORDS[k].label, ...c }])
);

/* An accepted application whose project the organizer archived: the listing
   is hidden from members now (only the saved copy comes back, marked
   `unlisted`) and archiving stamped assignment.closedAt on the row. A project
   brought back is readable again, so it reads accepted. */
const ARCHIVED_STATUS = { label: 'Archived', bg: '#F6F2EE', color: '#6B635C' };

export function isArchivedApplication(app) {
  return !!app && app.status === 'accepted' && !!(app.assignment && app.assignment.closedAt) && (!app.listings || !!app.listings.unlisted);
}

/** The status chip for one of the volunteer's applications. */
export function applicationChip(app) {
  if (isArchivedApplication(app)) return ARCHIVED_STATUS;
  return APPLICATION_STATUS[(app && app.status)] || APPLICATION_STATUS.pending;
}

const BOX = 'padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff';
// Inside a parent card (Profile), the list sits straight in the column.
const BARE = 'padding:0';
const HEADING = 'margin:0;font:600 16px/1.3 Geist;letter-spacing:-0.015em;color:#1A1714';

export default function VolunteerApplications({ showEmpty = false, bare = false }) {
  const box = bare ? BARE : BOX;
  const [apps, setApps] = useState(null);
  const [failed, setFailed] = useState(false);

  async function load() {
    try {
      // throwOnError: a failed read must not look like "never applied".
      setApps(await loadMyApplications({ throwOnError: true }));
      setFailed(false);
    } catch (err) {
      console.error('[applications] could not load', err);
      setFailed(true);
      setApps([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (apps === null) return null;
  if (failed && showEmpty) {
    return (
      <section style={S(box)} aria-label="Your applications">
        <h2 style={S(HEADING)}>Your applications</h2>
        <div role="alert" style={S('margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font:450 13px/1.5 Geist;color:#57504A')}>
          Couldn't load your applications. Check your connection and try again.
          <button type="button" onClick={load} className={cx(H.secondary, H.press)} style={S('flex:none;padding:0 14px;height:34px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 12px/1 Geist;color:#1A1714;cursor:pointer')}>
            Try again
          </button>
        </div>
      </section>
    );
  }
  if (apps.length === 0) {
    if (!showEmpty) return null;
    return (
      <section style={S(box)} aria-label="Your applications">
        <h2 style={S(HEADING)}>No applications yet</h2>
        <div style={S('margin-top:6px;font:450 13px/1.55 Geist;color:#8A8179')}>Apply to an opportunity and you'll see where it stands here.</div>
        <Link href="/discover" className={cx(H.secondary, H.press)} style={S('margin-top:12px;display:inline-flex;align-items:center;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;text-decoration:none')}>
          Find opportunities
        </Link>
      </section>
    );
  }

  function openThread(app) {
    const name = (app.listings && app.listings.name) || 'the organizer';
    openModal({
      title: name,
      subtitle: applicationChip(app).label,
      Body: () => <MessageThread applicationId={app.id} recipientId={app.owner_id} recipientName={name} />,
    });
  }

  return (
    <section style={S(box)} aria-label="Your applications">
      <h2 style={S(HEADING)}>Your applications</h2>
      <ul style={S('margin:6px 0 0;padding:0;list-style:none')}>
        {apps.map((app, i) => {
          const st = applicationChip(app);
          const name = (app.listings && app.listings.name) || 'An opportunity';
          const meta = [app.position, app.listings && app.listings.cause, app.listings && app.listings.site].filter(Boolean).join(', ');
          return (
            <li
              key={app.id}
              style={S(`padding:12px 0;${i < apps.length - 1 ? 'border-bottom:1px solid #F1EBE4;' : ''}display:flex;align-items:center;gap:12px;flex-wrap:wrap`)}
            >
              <div style={S('min-width:0;flex:1 1 200px')}>
                {app.listing_id ? (
                  <Link href={`/join/${app.listing_id}`} className={H.link} style={S('font:600 14px/1.2 Geist;color:#1A1714;text-decoration:none')}>
                    {name}
                  </Link>
                ) : (
                  <div style={S('font:600 14px/1.2 Geist;color:#1A1714')}>{name}</div>
                )}
                {meta ? <div className="vu-break" style={S('margin-top:3px;font:450 12px/1.4 Geist;color:#8A8179')}>{meta}</div> : null}
              </div>
              <span style={S(`padding:5px 10px;border-radius:8px;font:500 11px/1 ${MONO};background:${st.bg};color:${st.color};flex:none`)}>{st.label}</span>
              <button
                type="button"
                onClick={() => openThread(app)}
                aria-label={`Message ${name}`}
                className={cx(H.secondary, H.press)}
                style={S('flex:none;padding:0 14px;height:34px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;cursor:pointer')}
              >
                Message
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
