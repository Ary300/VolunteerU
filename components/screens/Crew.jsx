'use client';

/* ==========================================================================
   Crew.jsx, the volunteer's side of every project they joined. Accepted
   memberships come first (steps, check-in, hours, announcements and a message
   thread with the organizer). The full applications list lives on Profile
   (Applications); this page ends on one line counting them, with a link there.
   It's read-only on the organizer's data: the volunteer can message, check in,
   check off their own steps and log their own hours.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { S } from '../../lib/style.js';
import { C, F } from '../../lib/tokens.js';
import { Button, ErrorState, SkeletonRows } from '../ui.jsx';
import { loadMyApplications } from '../../lib/listings.js';
import { openModal, toast } from '../../lib/overlays.js';
import MemberProjects from '../MemberProjects.jsx';
import MessageThread from '../MessageThread.jsx';

/** Where the full applications list lives (Profile scrolls to it). */
const APPLICATIONS_HREF = '/profile?focus=applications';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The header line: how many projects you're in, or what happens next when
    an organizer hasn't accepted you anywhere yet. */
function summary(rows) {
  const inCount = rows.filter((r) => r.status === 'accepted').length;
  if (inCount) return `${plural(inCount, 'project', 'projects')} you're in`;
  return rows.length ? 'Once an organizer accepts you, the project shows up here.' : '';
}

/** "4 applications · 1 waiting", then a link to the full list on Profile.
    The rows themselves (status and Message) live there, so they're shown once. */
function ApplicationsLine({ rows }) {
  const waiting = rows.filter((r) => r.status === 'pending').length;
  return (
    <section aria-label="Your applications" className="vu-sec">
      <div style={S('display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 16px')}>
        <p style={S(`margin:0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>
          <span style={S(`color:${C.ink};font-weight:600`)}>{plural(rows.length, 'application', 'applications')}</span>
          {waiting ? (
            <>
              <span className="vu-sep" aria-hidden="true">{' · '}</span>
              {waiting} waiting to hear back
            </>
          ) : null}
        </p>
        <Link href={APPLICATIONS_HREF} className="vu-link-ul" style={S(`font:600 14px/1.5 ${F.body}`)}>
          See all on your profile
        </Link>
      </div>
    </section>
  );
}

/** Opens one application's thread with its organizer, the same dialog the
    project's Message button opens. */
function openThread(app) {
  const name = (app.listings && app.listings.name) || 'the organizer';
  openModal({
    title: name,
    subtitle: 'Messages with the organizer',
    Body: () => <MessageThread applicationId={app.id} recipientId={app.owner_id} recipientName={name} />,
  });
}

export default function Crew() {
  const router = useRouter();
  // Reply notifications link here as /crew?thread=<application id>.
  const threadId = useSearchParams().get('thread');
  const openedFor = useRef(null);
  // null while loading, 'error' when the applications query failed, else the rows.
  const [rows, setRows] = useState(null);
  // Bumped on retry so the child lists remount and fetch again.
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setRows(null);
    try {
      return (await loadMyApplications({ throwOnError: true })) || [];
    } catch (err) {
      console.error('[crew] could not load applications', err);
      return 'error';
    }
  }, []);

  useEffect(() => {
    let alive = true;
    load().then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [load, attempt]);

  // Open the linked thread once the applications are in, then drop the
  // parameter so a reload or Back doesn't open it again.
  useEffect(() => {
    if (!threadId) { openedFor.current = null; return; }
    if (!Array.isArray(rows) || openedFor.current === threadId) return;
    openedFor.current = threadId;
    router.replace('/crew', { scroll: false });
    const app = rows.find((r) => r.id === threadId);
    if (app && app.owner_id) openThread(app);
    else toast({ title: "That conversation isn't on your list", message: 'Your projects are below, and every application is on your profile.', tone: 'danger' });
  }, [threadId, rows, router]);

  const goDiscover = () => router.push('/discover');
  const empty = Array.isArray(rows) && rows.length === 0;
  // With no applications at all the header line says what lands here and
  // the header button is the way in, so there's no separate empty block.
  const line = empty
    ? "Once an organizer accepts you, the project shows up here with its team chat and your hours."
    : Array.isArray(rows) ? summary(rows) : '';

  return (
    <div className="vu-page vu-screen">
      <div style={S('max-width:1040px')}>
        <header style={S('display:flex;align-items:flex-end;justify-content:space-between;gap:16px 24px;flex-wrap:wrap')}>
          <div style={S('min-width:0')}>
            <h1 className="vu-t-h1" style={S(`color:${C.ink}`)}>My crew</h1>
            {line ? <p className={empty ? 'vu-empty' : undefined} style={S(`margin:8px 0 0;max-width:560px;font:400 15px/1.45 ${F.body};color:${C.ink2};text-wrap:pretty`)}>{line}</p> : null}
          </div>
          {empty ? (
            <Button size="sm" variant="dark" icon="search" onClick={goDiscover}>Find a project</Button>
          ) : (
            <Button size="sm" icon="search" onClick={goDiscover}>Find opportunities</Button>
          )}
        </header>

        {rows === null ? (
          <div style={S('margin-top:40px')}>
            <SkeletonRows n={3} h={88} />
          </div>
        ) : rows === 'error' ? (
          <div style={S('margin-top:24px')}>
            <ErrorState
              title="Couldn't load your projects"
              body="Check your connection and try again."
              onRetry={() => setAttempt((n) => n + 1)}
            />
          </div>
        ) : rows.length === 0 ? null : (
          <div key={attempt} style={S('margin-top:40px')}>
            <MemberProjects />
            {/* Plain section spacing: the project above already ends on its
                hours list's rule, so a second rule here would double it. */}
            <ApplicationsLine rows={rows} />
          </div>
        )}
      </div>
    </div>
  );
}
