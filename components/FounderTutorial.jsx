'use client';

/* ==========================================================================
   FounderTutorial.jsx, the walkthrough a founder sees the first time they land
   in the Lead workspace after publishing a project. Explains how to run it:
   recruit, review applications, take attendance (which verifies events), and
   confirm hours. Marks itself seen (meta.founderTutorialSeen) so it shows once.
   Mounted by AppShell; only appears on /lead routes with a live project.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { S, s, cx, H } from '../lib/style.js';
import { Pressable } from './ui.jsx';
import { useSnapshot, update } from '../lib/store.js';

const MONO = "'Geist Mono',monospace";

// A volunteer program runs shifts, a pipeline and verified attendance…
const VOLUNTEER_STEPS = [
  { icon: '🎉', title: 'Your project is live', body: 'Nice, it is published and volunteers can find it. Here is how to run it from this workspace. Ninety seconds, and you can skip any time.' },
  { icon: '🔗', title: 'Recruit your crew', body: 'Use “Copy recruit link” at the top to share your project anywhere. Anyone who opens it can apply, no account hoops for you to manage.' },
  { icon: '📋', title: 'Review applications', body: 'New applicants land in the Applications tab. Accept the ones you want and they move onto your crew, ready to be scheduled.' },
  { icon: '◷', title: 'Set the pipeline', body: 'In the Pipeline tab, add the steps a volunteer clears before their first shift, a Zoom briefing, a consent form, role training. Paste the real link so they can actually do it.' },
  { icon: '✓', title: 'Run sessions & take attendance', body: 'Create shifts, then take attendance after each session. Marking attendance is what turns a session into a verified event on the record.' },
  { icon: '⭐', title: 'Confirm hours', body: 'When a volunteer logs hours, confirm them in the Hours tab. Confirmed hours become verified on that volunteer’s record, the whole point.' },
];

// …a task team runs roles, briefings and a board instead.
const TEAM_STEPS = [
  { icon: '🎉', title: 'Your team is live', body: 'Nice, it is published and people can find it. Here is how to run it from this workspace. Ninety seconds, and you can skip any time.' },
  { icon: '🔗', title: 'Recruit your team', body: 'Use “Copy recruit link” at the top to share it anywhere. Anyone who opens it can apply, no account hoops for you to manage.' },
  { icon: '📋', title: 'Review applications', body: 'New applicants land in the Applications view. Accept the ones you want and they join your team.' },
  { icon: '◈', title: 'Assign roles & briefings', body: 'In the Team tab, give each member a role with a short briefing so they know exactly what they own.' },
  { icon: '☑', title: 'Run the task board', body: 'In the Tasks tab, add tasks and assign them. Move each to done as your team ships the work.' },
  { icon: '💬', title: 'Keep everyone in the loop', body: 'Use Messages to post updates and answer questions. Everything you build has a real record behind it.' },
];

export default function FounderTutorial() {
  const pathname = usePathname() || '';
  const { state } = useSnapshot();
  const [i, setI] = useState(0);
  const [closing, setClosing] = useState(false);

  const live = (state.projects || []).filter((p) => !p.archived);
  const hasProject = live.length > 0;
  // Show the steps that match the kind of project they just published.
  const isTeamProject = hasProject && live[0].orgType === 'team';
  const STEPS = isTeamProject ? TEAM_STEPS : VOLUNTEER_STEPS;
  const show =
    state.session.authed &&
    /^\/lead/.test(pathname) &&
    hasProject &&
    state.meta &&
    !state.meta.founderTutorialSeen;

  useEffect(() => {
    if (!show) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') update((sst) => { sst.meta = { ...sst.meta, founderTutorialSeen: true }; }); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [show]);

  if (!show) return null;

  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  function finish() {
    setClosing(true);
    update((sst) => { sst.meta = { ...sst.meta, founderTutorialSeen: true }; });
  }
  function next() {
    if (last) finish();
    else setI((n) => n + 1);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Founder walkthrough"
      style={S('position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(26,23,20,.55);backdrop-filter:blur(3px)')}
    >
      <div className="vu-sheet" style={S('width:100%;max-width:460px;border-radius:20px;background:#fff;border:1px solid #E8E1D9;box-shadow:0 24px 60px rgba(26,23,20,.28);overflow:hidden')}>
        <div style={S('padding:28px 28px 22px;text-align:center')}>
          <div key={i} className="vu-pop" style={S('width:64px;height:64px;margin:0 auto;border-radius:18px;display:grid;place-items:center;font-size:30px;background:linear-gradient(180deg,#FCEDE6 0%,#F7DECF 100%);border:1px solid #F1D6C6')}>
            {step.icon}
          </div>
          <div style={S(`margin-top:16px;font:500 10px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>
            Step {i + 1} of {STEPS.length}
          </div>
          <h2 style={S('margin:10px 0 0;font:600 22px/1.2 Geist;letter-spacing:-0.03em;color:#1A1714')}>{step.title}</h2>
          <p style={S('margin:10px 0 0;font:450 14px/1.6 Geist;color:#6B635C')}>{step.body}</p>
        </div>
        <div style={S('display:flex;align-items:center;justify-content:center;gap:7px;padding:0 28px')}>
          {STEPS.map((_, n) => (
            <span key={n} aria-hidden="true" style={s('width:7px;height:7px;border-radius:50%;transition:background .2s ease, width .2s ease', n === i ? 'width:20px;background:#C2603C' : n < i ? 'background:#D8B7A6' : 'background:#EFE3DC')} />
          ))}
        </div>
        <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;padding:22px 28px 26px')}>
          <Pressable label="Skip the tour" onClick={finish} className={H.link} style={S('font:500 13px/1 Geist;color:#8A8179;cursor:pointer')}>Skip</Pressable>
          <div style={S('display:flex;align-items:center;gap:10px')}>
            {i > 0 ? (
              <Pressable label="Previous step" onClick={() => setI((n) => Math.max(0, n - 1))} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E7C0AC;background:#fff;font:600 14px/1 Geist;color:#C2603C;cursor:pointer')}>Back</Pressable>
            ) : null}
            <Pressable label={last ? 'Finish the tour' : 'Next step'} disabled={closing} onClick={next} className={cx(H.primary, H.press)} style={S('display:inline-flex;align-items:center;gap:8px;padding:0 20px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}>
              {last ? 'Start running it' : 'Next'}
            </Pressable>
          </div>
        </div>
      </div>
    </div>
  );
}
