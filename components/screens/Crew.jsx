'use client';

/* ==========================================================================
   Crew.jsx — the volunteer's own CRM. Everywhere they volunteer, in one place:
   each membership's pipeline (with the organizer's links), briefings, check-in,
   logged hours, the organizer's message board, and a direct message thread.
   It's read-only on the organizer's data — the volunteer can message, check in,
   check off their own steps and log their own hours, but not edit the program.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable, EmptyState } from '../ui.jsx';
import { useSnapshot } from '../../lib/store.js';
import { loadMyMemberships } from '../../lib/listings.js';
import MemberProjects from '../MemberProjects.jsx';
import VolunteerApplications from '../VolunteerApplications.jsx';

const MONO = "'Geist Mono',monospace";

export default function Crew() {
  const router = useRouter();
  const { state } = useSnapshot();
  const [count, setCount] = useState(null); // number of active memberships

  useEffect(() => {
    let alive = true;
    loadMyMemberships().then((rows) => { if (alive) setCount((rows || []).length); }).catch(() => { if (alive) setCount(0); });
    return () => { alive = false; };
  }, []);

  const pendingApps = (state.applications || []).filter((a) => a.st !== 'Withdrawn' && a.st !== 'Accepted').length;

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:24px')}>
        <div>
          <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>My crew</div>
          <h1 style={S('margin:12px 0 0;font:600 34px/1.06 Geist;letter-spacing:-0.04em')}>Everywhere you volunteer</h1>
          <p style={S('margin:8px 0 0;font:450 15px/1.5 Geist;color:#6B635C;max-width:560px')}>
            Every project you have joined, in one place — your steps and the organizer&apos;s links, check-in, your logged hours, announcements, and a direct line to each organizer.
          </p>
        </div>
        <Pressable
          label="Find more projects"
          onClick={() => router.push('/discover')}
          className={cx(H.secondaryLift, H.press)}
          style={S('display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E7C0AC;background:#fff;font:600 14px/1 Geist;color:#C2603C;cursor:pointer')}
        >
          Find more projects
        </Pressable>
      </div>

      <div style={S('margin-top:26px;display:flex;flex-direction:column;gap:16px')}>
        <MemberProjects />
        <VolunteerApplications />
      </div>

      {count === 0 && pendingApps === 0 ? (
        <div style={S('margin-top:8px')}>
          <EmptyState
            icon="❖"
            title="You have not joined a project yet"
            body="When an organizer accepts you, this becomes your home base for that project — steps, check-in, hours and messaging. Find something to join to get started."
            cta="Browse openings"
            onCta={() => router.push('/discover')}
          />
        </div>
      ) : null}
    </div>
  );
}
