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
import { C, F, causeOf, causeKey } from '../lib/tokens.js';
import { loadMyApplications } from '../lib/listings.js';
import { openModal } from '../lib/overlays.js';
import { pickPhotos } from '../lib/photos.js';
import MessageThread from './MessageThread.jsx';
import { Button, StatusText } from './ui.jsx';
import { Sep } from './vu/ListingCard.jsx';
import { APPLICATION_STATUS as STATUS_WORDS } from '../lib/seed.js';

// Words from lib/seed.js (shared with the lead's screens); each status maps
// to a status tone (StatusText in the rows).
const TONES = { pending: 'wait', accepted: 'ok', waitlisted: 'mute', declined: 'bad', withdrawn: 'mute' };
export const APPLICATION_STATUS = Object.fromEntries(
  Object.entries(TONES).map(([k, tone]) => [k, { label: STATUS_WORDS[k].label, tone }])
);

/* An accepted application whose project the organizer archived: the listing
   is hidden from members now (only the saved copy comes back, marked
   `unlisted`) and archiving stamped assignment.closedAt on the row. A project
   brought back is readable again, so it reads accepted. */
const ARCHIVED_STATUS = { label: 'Archived', tone: 'mute' };

export function isArchivedApplication(app) {
  return !!app && app.status === 'accepted' && !!(app.assignment && app.assignment.closedAt) && (!app.listings || !!app.listings.unlisted);
}

/** The status (label and tone) for one of the volunteer's applications. */
export function applicationChip(app) {
  if (isArchivedApplication(app)) return ARCHIVED_STATUS;
  return APPLICATION_STATUS[(app && app.status)] || APPLICATION_STATUS.pending;
}

const HEADING = `margin:0;font:650 22px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`;

/** "Line packer · Food and hunger · Riverbend Food Bank": the role, the cause's
    display label and the place name (the street address stays on /join). */
function metaParts(app) {
  const l = app.listings || {};
  const cause = l.cause ? (causeKey(l.cause) === 'other' ? l.cause : causeOf(l.cause).label) : '';
  const place = String(l.site || '').split(',')[0].trim();
  return [app.position, cause, place].filter(Boolean);
}

/**
 * Everything the volunteer applied to, as plain divided rows. The list sits
 * straight in the page column (no card around it). `bare` is kept for
 * callers that already pass it.
 */
export default function VolunteerApplications({ showEmpty = false, bare = false }) {
  void bare;
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
      <section aria-label="Your applications">
        <h2 style={S(HEADING)}>Your applications</h2>
        <div role="alert" style={S(`margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>
          Couldn't load your applications. Check your connection and try again.
          <Button size="sm" icon="refresh" onClick={load}>Try again</Button>
        </div>
      </section>
    );
  }
  if (apps.length === 0) {
    if (!showEmpty) return null;
    return (
      <section aria-label="Your applications">
        <h2 style={S(HEADING)}>No applications yet</h2>
        <p style={S(`margin:6px 0 0;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>Apply to an opportunity and you'll see where it stands here.</p>
        <div style={S('margin-top:14px')}>
          <Button href="/discover" size="sm" icon="search">Find opportunities</Button>
        </div>
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

  // Own covers only: a stock photo would misrepresent a listing.
  const photos = pickPhotos(apps.map((a) => ({ id: a.id, cover: a.listings && a.listings.cover, cause: a.listings && a.listings.cause })), { seed: false });

  return (
    <section aria-label="Your applications">
      <h2 style={S(HEADING)}>Your applications</h2>
      <ul className="vu-list" style={S('margin:16px 0 0;padding:0;list-style:none')}>
        {apps.map((app) => {
          const st = applicationChip(app);
          const name = (app.listings && app.listings.name) || 'An opportunity';
          const meta = metaParts(app);
          const photo = photos.get(app.id);
          return (
            <li key={app.id}>
              <div className={photo ? 'vu-row' : 'vu-row vu-row--nolead'}>
                {photo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img className="vu-row-thumb" src={photo.sm} alt="" style={{ objectPosition: photo.pos }} />
                ) : null}
                <div style={S('min-width:0')}>
                  {app.listing_id ? (
                    <Link href={`/join/${app.listing_id}`} className={cx('vu-row-t', H.link)} style={S('text-decoration:none')}>{name}</Link>
                  ) : (
                    <span className="vu-row-t">{name}</span>
                  )}
                  {meta.length ? (
                    <span className="vu-row-m">
                      {meta.map((m, i) => (
                        <span key={i}>
                          {i ? <Sep /> : null}
                          {m}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>
                <div className="vu-row-end">
                  <StatusText tone={st.tone}>{st.label}</StatusText>
                  <Button size="sm" onClick={() => openThread(app)} aria-label={`Message ${name}`}>Message</Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
