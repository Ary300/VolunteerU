'use client';

/* ==========================================================================
   Tutorial.jsx, the one-time welcome walkthrough. Shows on the first visit to
   the signed-in app (once onboarding is done), explains the main tabs, then
   marks itself seen on the account so it never shows again. Mounted by
   AppShell. `TourDialog` is shared with FounderTutorial.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { S, s, cx, H } from '../lib/style.js';
import { Pressable, Icon } from './ui.jsx';
import { useSnapshot, update } from '../lib/store.js';

const MONO = "'Geist Mono',monospace";

const STEPS = [
  {
    icon: 'compass',
    title: 'Search on Discover',
    body: 'Search by cause and town. You get opportunities posted on VolunteerU and nonprofits from IRS records.',
  },
  {
    icon: 'users',
    title: 'Projects you join',
    body: 'Each project you join gets a page under My crew, with its shifts and messages from the organizer.',
  },
  {
    icon: 'clock',
    title: 'Log hours after a shift',
    body: 'Add what you did and how long. The organizer confirms it, and confirmed hours show on your profile.',
  },
  {
    icon: 'flag',
    title: 'Start a student project',
    body: 'Run your own from Lead a project. You post shifts, accept people who apply and confirm their hours.',
  },
];

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Modal walkthrough shell. Focus moves to the primary button on each step,
 * Tab stays inside the dialog, Escape and Skip both call `onDone`.
 */
export function TourDialog({ steps, label, doneLabel, onDone }) {
  const [i, setI] = useState(0);
  const [closing, setClosing] = useState(false);
  const boxRef = useRef(null);
  const primaryRef = useRef(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  function done() {
    if (closing) return;
    setClosing(true);
    onDone();
  }

  // Lock body scroll, handle Escape and keep Tab inside the dialog.
  useEffect(() => {
    const prev = document.body.style.overflow;
    const prevFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(); return; }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const els = Array.from(boxRef.current.querySelectorAll(FOCUSABLE));
      if (!els.length) return;
      const first = els[0];
      const end = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
      else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
      else if (!boxRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (primaryRef.current) primaryRef.current.focus();
  }, [i]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      aria-describedby="vu-tour-body"
      style={S('position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(26,23,20,.55)')}
    >
      <div ref={boxRef} className="vu-sheet" style={S('width:100%;max-width:460px;border-radius:20px;background:#fff;border:1px solid #E8E1D9;box-shadow:0 24px 60px rgba(26,23,20,.28);overflow:hidden')}>
        <div style={S('padding:28px 28px 22px;text-align:center')}>
          <div key={i} className="vu-pop" style={S('width:56px;height:56px;margin:0 auto;border-radius:16px;display:grid;place-items:center;background:#FCEDE6;border:1px solid #F1D6C6;color:#C2603C')}>
            <Icon name={step.icon} size={26} />
          </div>
          <div style={S(`margin-top:16px;font:500 12px/1 ${MONO};color:#6B635C`)}>
            {i + 1} of {steps.length}
          </div>
          <h2 style={S('margin:10px 0 0;font:600 22px/1.2 Geist;letter-spacing:-0.03em;color:#1A1714')}>{step.title}</h2>
          <p id="vu-tour-body" style={S('margin:10px 0 0;font:450 14px/1.6 Geist;color:#57504A')}>{step.body}</p>
        </div>

        <div style={S('display:flex;align-items:center;justify-content:center;gap:7px;padding:0 28px')}>
          {steps.map((_, n) => (
            <span
              key={n}
              aria-hidden="true"
              style={s('width:7px;height:7px;border-radius:50%;transition:background .2s ease, width .2s ease', n === i ? 'width:20px;background:#C2603C' : n < i ? 'background:#D8B7A6' : 'background:#EFE3DC')}
            />
          ))}
        </div>

        <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;padding:22px 28px 26px')}>
          <Pressable label="Skip the tour" onClick={done} className={H.link} style={S('font:500 13px/1 Geist;color:#6B635C;cursor:pointer')}>
            Skip
          </Pressable>
          <div style={S('display:flex;align-items:center;gap:10px')}>
            {i > 0 ? (
              <Pressable
                label="Back"
                onClick={() => setI((n) => Math.max(0, n - 1))}
                className={cx(H.secondary, H.press)}
                style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E7C0AC;background:#fff;font:600 14px/1 Geist;color:#C2603C;cursor:pointer')}
              >
                Back
              </Pressable>
            ) : null}
            <Pressable
              ref={primaryRef}
              label={last ? doneLabel : 'Next'}
              disabled={closing}
              onClick={() => (last ? done() : setI((n) => n + 1))}
              className={H.press}
              style={S('display:inline-flex;align-items:center;gap:8px;padding:0 20px;height:40px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;cursor:pointer')}
            >
              {last ? doneLabel : 'Next'}
            </Pressable>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Tutorial() {
  const pathname = usePathname() || '';
  const { state } = useSnapshot();
  const meta = state.meta;

  // On /lead with a fresh project the founder tour goes first, so the two
  // dialogs never stack. This one follows once that is closed.
  const founderPending =
    /^\/lead/.test(pathname) &&
    (state.projects || []).some((p) => !p.archived) &&
    !(meta && meta.founderTutorialSeen);

  const show = state.session.authed && state.onboarding.completed && meta && !meta.tutorialSeen && !founderPending;
  if (!show) return null;

  return (
    <TourDialog
      steps={STEPS}
      label="Welcome tour"
      doneLabel="Done"
      onDone={() => update((sst) => { sst.meta = { ...sst.meta, tutorialSeen: true }; })}
    />
  );
}
