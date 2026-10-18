'use client';

/* ==========================================================================
   FounderTutorial.jsx, the walkthrough a project lead sees the first time
   they land in the Lead workspace after creating a project. Explains how to
   run it: share it, review applications, take attendance and confirm hours.
   Mounted by AppShell; only appears on /lead routes with a live project, and
   `activeTour()` in Tutorial.jsx keeps it from opening with the welcome tour.
   Each step points at the real header button or project tab it is about.

   Finishing it marks it seen and lets the welcome tour follow. Skipping it
   (Skip or Escape) marks both seen, since a student who skips one tour
   doesn't want a second one right after.
   ========================================================================== */

import { usePathname } from 'next/navigation';
import { useSnapshot, update } from '../lib/store.js';
import { TourDialog, activeTour, useModalOpen } from './Tutorial.jsx';

/** The real Copy join link button in the Lead header (Lead.jsx). */
const SHARE_ANCHOR = ['.vu-lead-actions button[aria-label="Copy join link"]'];
/** A tab in the Lead workspace's tab strip, by its key (Lead.jsx VOL_TABS / TEAM_TABS). */
const tabAnchor = (key) => [`#lead-tab-${key}`];

// The share step leaves the real button clickable, so the lead can copy the
// link while the step explains it.
const SHARE_STEP = {
  anchor: SHARE_ANCHOR,
  interactive: true,
  title: 'Share your project',
  body: 'Copy join link puts your project\'s link on your clipboard. Send it anywhere, and anyone who opens it can apply.',
};

// A volunteer program runs shifts, setup steps and attendance.
const VOLUNTEER_STEPS = [
  SHARE_STEP,
  { anchor: tabAnchor('applications'), title: 'Review applications', body: 'New applicants show up on the Applications tab. Accept someone and they join your project.' },
  { anchor: tabAnchor('pipeline'), title: 'Add setup steps', body: 'On the Setup steps tab, list what volunteers do before their first shift, with a link for each step.' },
  { anchor: tabAnchor('attendance'), title: 'Take attendance', body: 'After each shift, mark who came on the Attendance tab.' },
  { anchor: tabAnchor('hours'), title: 'Confirm hours', body: 'When a volunteer logs hours, confirm or adjust them on the Hours tab.' },
];

// A task team runs roles and a board instead.
const TEAM_STEPS = [
  SHARE_STEP,
  { anchor: tabAnchor('overview'), title: 'Accept people who apply', body: 'New applicants show up on the Overview tab. Accept someone and they join your team.' },
  { anchor: tabAnchor('tasks'), title: 'Give each person a role', body: 'On the Tasks tab, add roles with a short briefing, then pick a role for each member.' },
  { anchor: tabAnchor('tasks'), title: 'Track tasks', body: "On the Tasks tab, add tasks, give each one an owner, and mark it done when it's finished." },
  { anchor: tabAnchor('messages'), title: 'Post updates', body: 'Use the Messages tab to post updates and answer questions.' },
];

export default function FounderTutorial() {
  const pathname = usePathname() || '';
  const { state } = useSnapshot();
  const modalOpen = useModalOpen();

  if (modalOpen || activeTour(state, pathname) !== 'founder') return null;

  const live = (state.projects || []).filter((p) => !p.archived);
  // The tour follows the project the lead is looking at, else the newest one.
  const current = live.find((p) => p.id === state.activeProjectId) || live[0];
  const steps = current.orgType === 'team' ? TEAM_STEPS : VOLUNTEER_STEPS;

  return (
    <TourDialog
      key={current.id}
      steps={steps}
      label="Project tour"
      doneLabel="Done"
      onDone={(reason) =>
        update((sst) => {
          sst.meta = { ...sst.meta, founderTutorialSeen: true, ...(reason === 'finish' ? {} : { tutorialSeen: true }) };
        })
      }
    />
  );
}
