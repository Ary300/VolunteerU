'use client';

/* ==========================================================================
   Crew.jsx, the volunteer's side of every project they joined or applied to.
   Accepted memberships come first (steps, check-in, hours, announcements and a
   message thread with the organizer), then every application and its status.
   It's read-only on the organizer's data: the volunteer can message, check in,
   check off their own steps and log their own hours.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, cx, H } from '../../lib/style.js';
import { Pressable, EmptyState, ErrorState, SkeletonRows, Icon } from '../ui.jsx';
import { loadMyApplications } from '../../lib/listings.js';
import MemberProjects from '../MemberProjects.jsx';
import VolunteerApplications from '../VolunteerApplications.jsx';

export default function Crew() {
  const router = useRouter();
  // null while loading, 'error' when the applications query failed, else the count.
  const [count, setCount] = useState(null);
  // Bumped on retry so the child lists remount and fetch again.
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setCount(null);
    try {
      const rows = await loadMyApplications({ throwOnError: true });
      return (rows || []).length;
    } catch (err) {
      console.error('[crew] could not load applications', err);
      return 'error';
    }
  }, []);

  useEffect(() => {
    let alive = true;
    load().then((n) => { if (alive) setCount(n); });
    return () => { alive = false; };
  }, [load, attempt]);

  const goDiscover = () => router.push('/discover');

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:24px')}>
        <h1 style={S('margin:0;font:600 34px/1.06 Geist;letter-spacing:-0.04em')}>Everywhere you volunteer</h1>
        <Pressable
          label="Find opportunities"
          onClick={goDiscover}
          className={cx(H.secondaryLift, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E7C0AC;background:#fff;font:600 14px/1 Geist;color:#C2603C;cursor:pointer')}
        >
          <Icon name="search" size={15} />
          Find opportunities
        </Pressable>
      </div>

      {count === null ? (
        <div style={S('margin-top:26px')}>
          <SkeletonRows n={3} h={88} />
        </div>
      ) : count === 'error' ? (
        <div style={S('margin-top:26px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
          <ErrorState
            title="Couldn't load your projects"
            body="Check your connection and try again."
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </div>
      ) : count === 0 ? (
        <div style={S('margin-top:8px')}>
          <EmptyState
            icon="users"
            title="No projects yet"
            body="Apply to an opportunity. Once the organizer accepts you, the project shows up here."
            cta="Find opportunities"
            onCta={goDiscover}
          />
        </div>
      ) : (
        <div key={attempt} style={S('margin-top:26px;display:flex;flex-direction:column;gap:16px')}>
          <MemberProjects />
          <VolunteerApplications />
        </div>
      )}
    </div>
  );
}
