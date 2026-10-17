'use client';

/* ==========================================================================
   FounderTutorial.jsx, the walkthrough a project lead sees the first time
   they land in the Lead workspace after creating a project. Explains how to
   run it: recruit, review applications, take attendance and confirm hours.
   Marks itself seen (meta.founderTutorialSeen) so it shows once. Mounted by
   AppShell; only appears on /lead routes with a live project.
   ========================================================================== */

import { usePathname } from 'next/navigation';
import { useSnapshot, update } from '../lib/store.js';
import { TourDialog } from './Tutorial.jsx';

// A volunteer program runs shifts, setup steps and attendance.
const VOLUNTEER_STEPS = [
  { icon: 'link', title: 'Share your project', body: 'Press Copy join link at the top and send the link anywhere. Anyone who opens it can apply.' },
  { icon: 'inbox', title: 'Review applications', body: 'New applicants show up on the Applications tab. Accept someone and they join your project.' },
  { icon: 'clipboard', title: 'Add setup steps', body: 'On the Pipeline tab, list what volunteers do before their first shift, with a link for each step.' },
  { icon: 'calendar', title: 'Take attendance', body: 'After each shift, mark who came on the Attendance tab.' },
  { icon: 'check-circle', title: 'Confirm hours', body: 'When a volunteer logs hours, confirm or adjust them on the Hours tab.' },
];

// A task team runs roles and a board instead.
const TEAM_STEPS = [
  { icon: 'link', title: 'Share your project', body: 'Press Copy join link at the top and send the link anywhere. Anyone who opens it can apply.' },
  { icon: 'inbox', title: 'Review applications', body: 'New applicants show up on the Overview tab. Accept someone and they join your team.' },
  { icon: 'users', title: 'Give each person a role', body: 'On the Tasks tab, add roles with a short briefing, then pick a role for each member.' },
  { icon: 'check-circle', title: 'Track tasks', body: "On the Tasks tab, add tasks, give each one an owner, and mark it done when it's finished." },
  { icon: 'message', title: 'Post updates', body: 'Use the Messages tab to post updates and answer questions.' },
];

export default function FounderTutorial() {
  const pathname = usePathname() || '';
  const { state } = useSnapshot();

  const live = (state.projects || []).filter((p) => !p.archived);
  // The tour follows the project the lead is looking at, else the newest one.
  const current = live.find((p) => p.id === state.activeProjectId) || live[0];
  const steps = current && current.orgType === 'team' ? TEAM_STEPS : VOLUNTEER_STEPS;
  const show = state.session.authed && /^\/lead/.test(pathname) && !!current && state.meta && !state.meta.founderTutorialSeen;
  if (!show) return null;

  return (
    <TourDialog
      steps={steps}
      label="Project tour"
      doneLabel="Done"
      onDone={() => update((sst) => { sst.meta = { ...sst.meta, founderTutorialSeen: true }; })}
    />
  );
}
