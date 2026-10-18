'use client';

/* ==========================================================================
   Tutorial.jsx, the one-time welcome walkthrough. Shows on the first visit to
   the signed-in app (once onboarding is done), points at the main tabs, then
   marks itself seen on the account so it never shows again. Mounted by
   AppShell next to FounderTutorial.

   Only one walkthrough is ever on screen: `activeTour()` decides between the
   two, and neither opens over another modal. `TourDialog` is shared with
   FounderTutorial. Each step names the real control it is about (`anchor`,
   a list of CSS selectors); the page dims around that control and the step
   sits next to it. Nothing in the app is redrawn inside the tour. When the
   control isn't on screen the step shows centered, as plain text.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { S } from '../lib/style.js';
import { C, F, R, SH } from '../lib/tokens.js';
import { Button } from './ui.jsx';
import { useSnapshot, update } from '../lib/store.js';
import { useOverlays } from '../lib/overlays.js';

/** A main tab, as the phone tab bar or the desktop sidebar shows it. */
const navAnchor = (href) => [`nav.vu-tabbar a[href="${href}"]`, `#vu-sidebar nav a[href="${href}"]`];

// In the order the sidebar and the phone tab bar list the tabs.
const STEPS = [
  {
    anchor: navAnchor('/discover'),
    title: 'Search on Discover',
    body: 'Search by cause and town. You get opportunities posted on VolunteerU and nonprofits from IRS records.',
  },
  {
    anchor: navAnchor('/crew'),
    title: 'Projects you join',
    body: 'Each project you join gets a page under My crew, with its shifts and messages from the organizer.',
  },
  {
    anchor: navAnchor('/lead'),
    title: 'Start a student project',
    body: 'Run your own from Lead a project. You post shifts and confirm hours for the people you accept.',
  },
  {
    anchor: navAnchor('/profile'),
    title: 'Your hours',
    body: 'Sign up for shifts and the organizer confirms your hours. They add up on your profile, where you can also log hours from elsewhere.',
  },
];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Popover geometry, in CSS px.
const BOX_W = 360; // popover width on wide screens
const HOLE_PAD = 6; // breathing room around the highlighted control
const HOLE_R = 16; // corner radius of the highlight (10px control + 6px pad)
const GAP = 12; // between the highlight and the popover
const CARET = 12; // the pointer's square side, before rotation

/* Body scroll lock shared by every walkthrough, so one closing while the next
   opens never leaves the page stuck at overflow:hidden. */
let locks = 0;
let savedOverflow = '';
function lockBody() {
  if (locks === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks += 1;
}
function unlockBody() {
  locks = Math.max(0, locks - 1);
  if (locks === 0) document.body.style.overflow = savedOverflow;
}

/**
 * Which walkthrough may show right now: 'founder', 'welcome' or null.
 * The founder tour goes first on /lead for a lead who hasn't seen it; the
 * welcome tour follows once that one is out of the way.
 */
export function activeTour(state, pathname) {
  const meta = state.meta;
  if (!state.session.authed || !state.onboarding.completed || !meta) return null;
  const onLead = /^\/lead(\/|$)/.test(pathname || '');
  const hasProject = (state.projects || []).some((p) => !p.archived);
  if (onLead && hasProject && !meta.founderTutorialSeen) return 'founder';
  if (!meta.tutorialSeen) return 'welcome';
  return null;
}

/** True while an OverlayHost modal (confirm, sheet) is open, so a tour waits. */
export function useModalOpen() {
  const { modals } = useOverlays();
  return modals.length > 0;
}

/** First element matching one of `selectors` that is actually on screen. */
function findAnchor(selectors) {
  if (!selectors || !selectors.length) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[inert]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const offX = r.right <= 0 || r.left >= vw;
      // A closed phone drawer sits off the left edge; skip its links. Anything
      // else past an edge (a project tab scrolled out of the tab strip) is
      // still the control, just offscreen: place(true) scrolls it into view.
      if (offX && el.closest('#vu-sidebar')) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      return { el, offscreen: offX || r.bottom <= 0 || r.top >= vh };
    }
  }
  return null;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Where the popover goes for this anchor rect. Prefers the right side for a
 * control in the left rail (the sidebar), then below, then above. Returns
 * null for the side when nothing fits, and the popover centers instead.
 */
function layout(r, bw, bh, vw, vh) {
  const edge = vw < 600 ? 16 : 24;
  const hole = { x: r.left - HOLE_PAD, y: r.top - HOLE_PAD, w: r.width + HOLE_PAD * 2, h: r.height + HOLE_PAD * 2 };
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const inRail = hole.x + hole.w < vw * 0.35;
  if (inRail && vw - (hole.x + hole.w) - GAP - edge >= bw) {
    const top = clamp(cy - 40, edge, vh - bh - edge);
    return { hole, side: 'right', left: hole.x + hole.w + GAP, top, caret: clamp(cy - top, 22, bh - 22) };
  }
  const left = clamp(cx - bw / 2, edge, vw - bw - edge);
  const caret = clamp(cx - left, 22, bw - 22);
  if (vh - (hole.y + hole.h) - GAP - edge >= bh) return { hole, side: 'below', left, top: hole.y + hole.h + GAP, caret };
  if (hole.y - GAP - edge >= bh) return { hole, side: 'above', left, top: hole.y - GAP - bh, caret };
  return { hole, side: null, ...centered(bw, bh, vw, vh) };
}

/** Centered on wide screens, a bottom sheet with a 16px gutter on phones. */
function centered(bw, bh, vw, vh) {
  const left = (vw - bw) / 2;
  if (vw < 600) return { left, top: Math.max(16, vh - bh - 16) };
  return { left, top: Math.max(24, (vh - bh) / 2) };
}

/** The dim layer as an SVG path: the viewport minus a rounded hole. */
function dimPath(vw, vh, h) {
  const outer = `M0 0H${vw}V${vh}H0Z`;
  if (!h) return outer;
  const r = Math.min(HOLE_R, h.w / 2, h.h / 2);
  const { x, y, w } = h;
  const hh = h.h;
  return `${outer}M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + hh - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + hh}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + hh - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The small pointer on the popover's edge, aimed at the highlighted control. */
function Caret({ side, at }) {
  if (!side) return null;
  const half = CARET / 2;
  const pos = {
    right: `left:${-half}px;top:${at - half}px`,
    below: `top:${-half}px;left:${at - half}px`,
    above: `bottom:${-half}px;left:${at - half}px`,
  }[side];
  return <span aria-hidden="true" style={S(`position:absolute;${pos};width:${CARET}px;height:${CARET}px;background:#fff;transform:rotate(45deg);border-radius:2px`)} />;
}

/**
 * Modal walkthrough. Focus moves to the primary button on each step and Tab
 * stays inside the popover. `onDone(reason)` gets 'finish', 'skip' or
 * 'escape'. A step carries `anchor` (selectors for the real control it is
 * about); with `interactive: true` that control stays clickable and joins the
 * Tab order, so the student can use it while the step explains it.
 */
export function TourDialog({ steps, label, doneLabel = 'Done', onDone }) {
  const [i, setI] = useState(0);
  const [geo, setGeo] = useState(null);
  const closingRef = useRef(false);
  const boxRef = useRef(null);
  const primaryRef = useRef(null);
  const anchorRef = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;
  const stepRef = useRef(step);
  stepRef.current = step;

  function done(reason) {
    if (closingRef.current) return;
    closingRef.current = true;
    doneRef.current(reason);
  }

  // Measure the anchor and the popover, then place both. Skips the render
  // when nothing moved, so the polling below costs nothing at rest.
  function place(scroll) {
    const box = boxRef.current;
    if (!box) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const found = findAnchor(stepRef.current.anchor);
    if (found && scroll) {
      // A project tab can sit past the edge of the scrolling tab strip, and
      // the header can be scrolled away; bring the control into view first.
      found.el.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    const el = found && (!found.offscreen || scroll) ? found.el : null;
    anchorRef.current = el && stepRef.current.interactive ? el : null;
    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    const next = el ? layout(el.getBoundingClientRect(), bw, bh, vw, vh) : { hole: null, side: null, ...centered(bw, bh, vw, vh) };
    const rounded = { ...next, vw, vh, left: Math.round(next.left), top: Math.round(next.top), caret: Math.round(next.caret || 0) };
    setGeo((g) => (same(g, rounded) ? g : rounded));
  }

  // Lock body scroll, handle Escape and keep Tab inside the popover (plus
  // the highlighted control on an interactive step).
  useEffect(() => {
    const prevFocus = document.activeElement;
    lockBody();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done('escape');
        return;
      }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const els = [...(anchorRef.current ? [anchorRef.current] : []), ...boxRef.current.querySelectorAll(FOCUSABLE)];
      if (!els.length) return;
      // The highlighted control isn't next to the popover in the DOM, so
      // focus moves through the list here instead of by document order.
      e.preventDefault();
      const at = els.indexOf(document.activeElement);
      const to = at < 0 ? (e.shiftKey ? els.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + els.length) % els.length;
      els[to].focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      unlockBody();
      if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') prevFocus.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Place before paint on every step, scrolling the anchor into view once.
  useLayoutEffect(() => {
    place(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // Follow the anchor through resizes, scrolling and late layout (fonts,
  // data arriving). The interval catches moves no event reports.
  useEffect(() => {
    let raf = 0;
    const queue = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => place(false));
    };
    window.addEventListener('resize', queue);
    window.addEventListener('scroll', queue, true);
    const timer = window.setInterval(queue, 400);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', queue);
      window.removeEventListener('scroll', queue, true);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (primaryRef.current) primaryRef.current.focus();
  }, [i]);

  const hole = geo && geo.hole;
  const vw = geo ? geo.vw : 0;
  const vh = geo ? geo.vh : 0;
  const boxPos = geo ? `left:${geo.left}px;top:${geo.top}px` : 'left:0;top:0;visibility:hidden';

  return (
    // .vu-scrim keeps the shared overlay rules (z-index, print, phone toasts
    // moving to the top); the dimming itself is the clipped layer below. The
    // wrapper lets clicks through so only the dim, the blocker and the
    // popover take them, and the hole reaches the real control.
    <div className="vu-scrim vu-tour" style={S('display:block;padding:0;background:transparent;pointer-events:none')}>
      {/* The dim layer, with a hole over the control the step is about. */}
      <div
        aria-hidden="true"
        style={{
          ...S(`position:absolute;inset:0;background:${C.scrim};pointer-events:auto`),
          ...(geo ? { clipPath: `path(evenodd, "${dimPath(vw, vh, hole)}")` } : null),
        }}
      />
      {/* Only an interactive step lets clicks through to the real control. */}
      {hole && !step.interactive ? (
        <div aria-hidden="true" style={S(`position:absolute;left:${hole.x}px;top:${hole.y}px;width:${hole.w}px;height:${hole.h}px;pointer-events:auto`)} />
      ) : null}
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-describedby="vu-tour-body"
        style={S(`position:absolute;${boxPos};width:min(${BOX_W}px, calc(100vw - 32px));background:#fff;border-radius:${R.photo};box-shadow:${SH.popup};pointer-events:auto`)}
      >
        <div style={S('position:relative;z-index:1;padding:18px 20px 20px')}>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:28px')}>
            <div aria-live="polite" style={S(`font:600 13px/1.2 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>
              Step {i + 1} of {steps.length}
            </div>
            <Button variant="ghost" size="sm" aria-label="Skip the tour" onClick={() => done('skip')} extra={`margin-right:-2px;color:${C.ink2}`}>
              Skip
            </Button>
          </div>
          <h2 style={S(`margin:6px 0 0;font:650 20px/1.2 ${F.display};letter-spacing:-0.015em;color:${C.ink};text-wrap:balance`)}>{step.title}</h2>
          <p id="vu-tour-body" style={S(`margin:8px 0 0;font:400 15px/1.5 ${F.body};color:${C.ink2};text-wrap:pretty`)}>{step.body}</p>
          <div style={S('margin-top:18px;display:flex;align-items:center;justify-content:flex-end;gap:8px')}>
            {i > 0 ? (
              <Button variant="outline" size="md" onClick={() => setI((n) => Math.max(0, n - 1))}>
                Back
              </Button>
            ) : null}
            <Button
              ref={primaryRef}
              variant="primary"
              size="md"
              disabled={closingRef.current}
              onClick={() => (last ? done('finish') : setI((n) => Math.min(steps.length - 1, n + 1)))}
              extra="min-width:96px"
            >
              {last ? doneLabel : 'Next'}
            </Button>
          </div>
        </div>
        <Caret side={geo && geo.side} at={geo ? geo.caret : 0} />
      </div>
    </div>
  );
}

export default function Tutorial() {
  const pathname = usePathname() || '';
  const { state } = useSnapshot();
  const modalOpen = useModalOpen();

  if (modalOpen || activeTour(state, pathname) !== 'welcome') return null;

  return (
    <TourDialog
      steps={STEPS}
      label="Welcome tour"
      doneLabel="Done"
      onDone={() => update((sst) => { sst.meta = { ...sst.meta, tutorialSeen: true }; })}
    />
  );
}
