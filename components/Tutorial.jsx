'use client';

/* ==========================================================================
   Tutorial.jsx — the one-time welcome walkthrough. Shows on the first visit to
   the signed-in app (once onboarding is done), explains the main surfaces, then
   marks itself seen on the account so it never shows again. Mounted by AppShell.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S, s, cx, H } from '../lib/style.js';
import { Pressable } from './ui.jsx';
import { useSnapshot, update } from '../lib/store.js';

const MONO = "'Geist Mono',monospace";

const STEPS = [
  {
    icon: '👋',
    title: 'Welcome to VolunteerU',
    body: 'A quick tour of how everything fits together. Ninety seconds, then you are on your way. You can skip any time.',
  },
  {
    icon: '◎',
    title: 'Discover real openings',
    body: 'Search by cause and location to find student projects and registered nonprofits near you — pulled from real data, no fakes. Cards link straight to how to help.',
  },
  {
    icon: '❖',
    title: 'My crew — your home base',
    body: 'Every project you join lives here: the steps to clear before your first shift (with the organizer’s links), check-in, your hours, announcements, and a direct message to each organizer.',
  },
  {
    icon: '＋',
    title: 'Log your hours',
    body: 'Log volunteering from Home or your record — what you did, the category, and how long. The organizer confirms it, and confirmed hours become verified on your record.',
  },
  {
    icon: '🔥',
    title: 'Keep a weekly streak',
    body: 'Log a shift each week to build your streak. It shows in the sidebar and grows the more consistently you show up.',
  },
  {
    icon: '◈',
    title: 'Lead your own project',
    body: 'Ready to organize? Start a project, recruit a crew, run sessions and verify hours. Everything you build has a real record behind it.',
  },
];

export default function Tutorial() {
  const { state } = useSnapshot();
  const [i, setI] = useState(0);
  const [closing, setClosing] = useState(false);

  const show =
    state.session.authed &&
    state.onboarding.completed &&
    state.meta &&
    !state.meta.tutorialSeen;

  // Lock body scroll while the overlay is up.
  useEffect(() => {
    if (!show) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [show]);

  if (!show) return null;

  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  function finish() {
    setClosing(true);
    update((sst) => { sst.meta = { ...sst.meta, tutorialSeen: true }; });
  }

  function next() {
    if (last) finish();
    else setI((n) => n + 1);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome walkthrough"
      style={S('position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(26,23,20,.55);backdrop-filter:blur(3px)')}
    >
      <div
        className="vu-sheet"
        style={S('width:100%;max-width:460px;border-radius:20px;background:#fff;border:1px solid #E8E1D9;box-shadow:0 24px 60px rgba(26,23,20,.28);overflow:hidden')}
      >
        <div style={S('padding:28px 28px 22px;text-align:center')}>
          <div
            key={i}
            className="vu-pop"
            style={S('width:64px;height:64px;margin:0 auto;border-radius:18px;display:grid;place-items:center;font-size:30px;background:linear-gradient(180deg,#FCEDE6 0%,#F7DECF 100%);border:1px solid #F1D6C6')}
          >
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
            <span
              key={n}
              aria-hidden="true"
              style={s('width:7px;height:7px;border-radius:50%;transition:background .2s ease, width .2s ease', n === i ? 'width:20px;background:#C2603C' : n < i ? 'background:#D8B7A6' : 'background:#EFE3DC')}
            />
          ))}
        </div>

        <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;padding:22px 28px 26px')}>
          <Pressable
            label="Skip the tour"
            onClick={finish}
            className={H.link}
            style={S('font:500 13px/1 Geist;color:#8A8179;cursor:pointer')}
          >
            Skip
          </Pressable>
          <div style={S('display:flex;align-items:center;gap:10px')}>
            {i > 0 ? (
              <Pressable
                label="Previous step"
                onClick={() => setI((n) => Math.max(0, n - 1))}
                className={cx(H.secondary, H.press)}
                style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#1A1714;cursor:pointer')}
              >
                Back
              </Pressable>
            ) : null}
            <Pressable
              label={last ? 'Finish the tour' : 'Next step'}
              disabled={closing}
              onClick={next}
              className={cx(H.primary, H.press)}
              style={S('display:inline-flex;align-items:center;gap:8px;padding:0 20px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
            >
              {last ? 'Get started' : 'Next'}
            </Pressable>
          </div>
        </div>
      </div>
    </div>
  );
}
