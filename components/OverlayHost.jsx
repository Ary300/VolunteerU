'use client';

/* ==========================================================================
   OverlayHost.jsx, renders toasts, modals, confirmations and anchored menus
   ========================================================================== */

import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { S, s, cx, H } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import {
  useOverlays, dismissToast, holdToast, releaseToast, closeModal, closeMenu, closeTopOverlay,
} from '../lib/overlays.js';
import { SecondaryButton, Field, Icon, renderIcon } from './ui.jsx';
import RouteProgress from './RouteProgress.jsx';

export default function OverlayHost() {
  const { toasts, modals, menu } = useOverlays();

  // Escape closes the top-most overlay only. It listens in the capture phase
  // and stops the event there, so a drawer or page behind the overlay never
  // sees the same key press and closes too.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && closeTopOverlay()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // When a dialog closes, the second tap of a double tap (or the second
  // click of a double click) on its button would land on whatever was under
  // it, often the phone tab bar. Swallow that follow-up click for a moment.
  useClickShield(modals.length);

  // Lock background scroll while a modal is open.
  useEffect(() => {
    if (!modals.length) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modals.length]);

  const shown = useLeavingModals(modals);
  // On phones a toast born while a dialog was open has its own stack at the
  // top (lib/overlays.js toast()); every other toast stays at the bottom.
  const phone = usePhone();
  const topToasts = phone ? toasts.filter((t) => t.top) : [];
  const bottomToasts = phone ? toasts.filter((t) => !t.top) : toasts;

  return (
    <>
      <RouteProgress />
      {shown.map((m) => (m.html ? (
        <div key={`${m.id}-out`} className="vu-ghost" aria-hidden="true" inert dangerouslySetInnerHTML={{ __html: m.html }} />
      ) : (
        <Modal key={m.id} entry={m.entry} />
      )))}
      {menu ? <Menu menu={menu} /> : null}
      <div role="region" aria-label="Notifications" style={S('display:contents')}>
        <div className="vu-toasts">
          {bottomToasts.map((t) => (
            <Toast key={t.id} toast={t} />
          ))}
        </div>
        {topToasts.length ? (
          <div className="vu-toasts vu-toasts-top">
            {topToasts.map((t) => (
              <Toast key={t.id} toast={t} />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

const PHONE_MQ = '(max-width: 719px)';
function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(PHONE_MQ);
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return phone;
}

/* ---- closing dialogs -------------------------------------------------------
   When a dialog leaves the overlay store, the real dialog unmounts at once
   (focus goes back, its effects clean up) and a static copy of its markup
   stays for EXIT_MS, inert and hidden from assistive tech, so it can fade
   out instead of vanishing. The copy runs no React code, so nothing in it
   can read data the close just removed. Reduced motion: no copy.
   ------------------------------------------------------------------------- */

const EXIT_MS = 130;

function prefersReducedMotion() {
  if (typeof window === 'undefined') return true;
  if (document.documentElement.getAttribute('data-motion') === 'off') return true;
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* The copy is decoration: no ids (they belong to the live page), no dialog
   role and nothing focusable, so scripts and assistive tech never find it. */
function ghostMarkup(el) {
  const copy = el.cloneNode(true);
  for (const n of [copy, ...copy.querySelectorAll('*')]) {
    n.removeAttribute('id');
    n.removeAttribute('role');
    n.removeAttribute('aria-modal');
    n.removeAttribute('aria-labelledby');
    if (n.hasAttribute('tabindex')) n.setAttribute('tabindex', '-1');
  }
  return copy.outerHTML;
}

const MENU_EXIT_MS = 110;

/**
 * Leaves a static, inert copy of `el` on the page for a moment so a menu or
 * the welcome tour fades out instead of vanishing. Call it while `el` is
 * still in the DOM (a layout-effect cleanup runs before React removes it).
 * The copy sits outside React's tree and removes itself. Reduced motion: no
 * copy.
 * @param {HTMLElement|null} el
 * @param {string} className classes for the copy's wrapper
 */
export function leaveGhost(el, className = 'vu-ghost-pop') {
  if (!el || !el.isConnected || prefersReducedMotion()) return;
  const html = ghostMarkup(el);
  // Only a real removal leaves a copy: if the element is still on the page
  // a moment later (Strict Mode's rehearsal unmount), nothing happens. No
  // frame paints between the removal and this check.
  queueMicrotask(() => {
    if (el.isConnected) return;
    const wrap = document.createElement('div');
    wrap.className = className;
    wrap.setAttribute('aria-hidden', 'true');
    wrap.inert = true;
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), MENU_EXIT_MS + 40);
  });
}

function useLeavingModals(modals) {
  const prev = useRef([]);
  const ghosts = useRef(new Map()); // id -> { id, html, index }
  const [, rerender] = useState(0);

  // Read during render, while the closing dialog is still in the DOM, so the
  // copy replaces it in the same commit with no empty frame between.
  if (prev.current !== modals) {
    const live = new Set(modals.map((m) => m.id));
    if (typeof document !== 'undefined' && !prefersReducedMotion()) {
      prev.current.forEach((m, index) => {
        if (live.has(m.id) || ghosts.current.has(m.id)) return;
        const el = document.getElementById(`${m.id}-scrim`);
        if (el) ghosts.current.set(m.id, { id: m.id, html: ghostMarkup(el), index });
      });
    }
    prev.current = modals;
  }

  useEffect(() => {
    if (!ghosts.current.size) return undefined;
    const t = setTimeout(() => {
      ghosts.current.clear();
      rerender((n) => n + 1);
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [modals]);

  const out = modals.map((entry) => ({ id: entry.id, entry }));
  Array.from(ghosts.current.values())
    .sort((a, b) => a.index - b.index)
    .forEach((g) => out.splice(Math.min(g.index, out.length), 0, g));
  return out;
}

/* ---- click shield ---------------------------------------------------------
   Only the continuation of a multi-click (event.detail >= 2: the browser
   counts it as the same double click or double tap) is dropped, and only
   outside an open dialog, for 600ms after a dialog closes. A separate,
   deliberate click (detail 1) and keyboard activation (detail 0) always go
   through.
   ------------------------------------------------------------------------- */

const SHIELD_MS = 600;

function useClickShield(openCount) {
  const prev = useRef(openCount);
  const until = useRef(0);
  useEffect(() => {
    if (openCount < prev.current) until.current = Date.now() + SHIELD_MS;
    prev.current = openCount;
  }, [openCount]);
  useEffect(() => {
    const swallow = (e) => {
      if (Date.now() > until.current || !(e.detail >= 2)) return;
      const t = e.target;
      if (t && t.closest && t.closest('.vu-scrim')) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('click', swallow, true);
    window.addEventListener('dblclick', swallow, true);
    return () => {
      window.removeEventListener('click', swallow, true);
      window.removeEventListener('dblclick', swallow, true);
    };
  }, []);
}

/* ---- toast --------------------------------------------------------------- */

/* Each toast sits in a slot that folds shut while the toast fades, so the
   ones above it slide down instead of jumping (globals.css .vu-toast-slot). */
function Toast({ toast }) {
  return (
    <div className="vu-toast-slot" data-out={toast.out ? 'true' : undefined}>
      <div className="vu-toast-fit">
        <div
          className="vu-toast"
          data-tone={toast.tone}
          data-out={toast.out ? 'true' : 'false'}
          role={toast.tone === 'danger' ? 'alert' : 'status'}
          aria-live={toast.tone === 'danger' ? 'assertive' : 'polite'}
          onMouseEnter={() => holdToast(toast.id)}
          onMouseLeave={() => releaseToast(toast.id)}
          onFocus={() => holdToast(toast.id)}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) releaseToast(toast.id); }}
        >
          <span className="vu-toast-dot" aria-hidden="true" />
          <div style={S('flex:1;min-width:0')}>
            <div className="vu-toast-title">{toast.title}</div>
            {toast.message ? <div className="vu-toast-msg">{toast.message}</div> : null}
            {toast.actionLabel ? (
              <button
                type="button"
                className="vu-toast-act"
                onClick={() => {
                  try {
                    toast.onAction && toast.onAction();
                  } finally {
                    dismissToast(toast.id);
                  }
                }}
              >
                {toast.actionLabel}
              </button>
            ) : null}
            {toast.secondLabel ? (
              <button
                type="button"
                className="vu-toast-act"
                onClick={() => {
                  try {
                    toast.onSecond && toast.onSecond();
                  } finally {
                    dismissToast(toast.id);
                  }
                }}
              >
                {toast.secondLabel}
              </button>
            ) : null}
          </div>
          <button type="button" className="vu-toast-x" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- modal --------------------------------------------------------------- */

function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active || !ref.current) return undefined;
    const root = ref.current;
    const prev = document.activeElement;

    const focusables = () =>
      Array.from(
        root.querySelectorAll(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const timer = setTimeout(() => {
      const list = focusables();
      const target = root.querySelector('[data-autofocus]') || list.find((el) => !el.hasAttribute('data-modal-close')) || root;
      if (target === root) root.setAttribute('tabindex', '-1');
      target.focus();
    }, 20);

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      root.removeEventListener('keydown', onKey);
      if (prev && prev.focus) prev.focus();
    };
  }, [ref, active]);
}

function Modal({ entry }) {
  const ref = useRef(null);
  useFocusTrap(ref, true);
  const titleId = `${entry.id}-title`;
  const { Body, footer, api } = entry;

  const close = (reason) => closeModal(entry.id, reason);

  return (
    <div
      id={`${entry.id}-scrim`}
      className="vu-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && entry.dismissable !== false) close('scrim');
      }}
    >
      <div
        ref={ref}
        className={cx('vu-dialog', entry.size === 'wide' && 'vu-dialog--wide', entry.size === 'slim' && 'vu-dialog--slim')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={entry.title ? titleId : undefined}
      >
        {entry.title ? (
          <div className="vu-dialog-head" style={S('padding:24px 24px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:16px')}>
            <div style={S('flex:1;min-width:0;overflow-wrap:anywhere')}>
              <div id={titleId} style={S(`font:600 21px/1.2 ${F.display};letter-spacing:-0.015em;color:${C.ink}`)}>
                {entry.title}
              </div>
              {entry.subtitle ? (
                <div style={S(`margin-top:6px;font:400 14px/1.5 ${F.body};color:${C.ink2};text-wrap:pretty`)}>{entry.subtitle}</div>
              ) : null}
            </div>
            {entry.dismissable !== false ? (
              <button
                type="button"
                data-modal-close
                aria-label="Close"
                className={cx(H.icon, H.press)}
                onClick={() => close('button')}
                style={S(`flex:none;width:36px;height:36px;margin:-6px -8px 0 0;border-radius:10px;display:grid;place-items:center;color:${C.ink2};cursor:pointer;transition:background .16s ease, color .16s ease`)}
              >
                <Icon name="x" size={20} />
              </button>
            ) : null}
          </div>
        ) : null}

        {entry.kind === 'confirm' ? (
          <Confirm entry={entry} padTop={entry.title ? '18px' : '24px'} />
        ) : (
          <div className="vu-dialog-body" style={S(`padding:${entry.title ? '18px' : '24px'} 24px ${footer ? '18px' : '24px'}`)}>
            {Body ? <Body api={api} /> : entry.body}
          </div>
        )}

        {entry.kind === 'confirm' ? null : footer ? (
          <div className="vu-dialog-foot" style={S(`padding:16px 24px 22px;border-top:1px solid ${C.line};display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap`)}>
            {typeof footer === 'function' ? footer(api) : footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---- confirmation --------------------------------------------------------
   Body and footer share one piece of state, so a type-to-confirm field is a
   normal controlled input and the confirm button reads what was typed.
   ------------------------------------------------------------------------- */

function Confirm({ entry, padTop }) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const need = entry.requireText || '';
  const matches = !need || text.trim() === need;

  const finish = (v) => {
    entry.onResolve && entry.onResolve(v);
    closeModal(entry.id, v ? 'confirm' : 'cancel');
  };
  const tryConfirm = () => {
    if (!matches) {
      // The field says what to type; focus goes there to type it.
      setInvalid(true);
      const input = document.getElementById(`${entry.id}-text`);
      if (input) input.focus();
      return;
    }
    finish(true);
  };

  return (
    <>
      <div className="vu-dialog-body" style={S(`padding:${padTop} 24px 18px`)}>
        {entry.body ? <div style={S(`font:400 15px/1.55 ${F.body};color:${C.ink2};text-wrap:pretty`)}>{entry.body}</div> : null}
        {need ? (
          <div style={S(entry.body ? 'margin-top:16px' : '')} id={`${entry.id}-require`}>
            <Field
              id={`${entry.id}-text`}
              label={`Type ${need} to confirm`}
              placeholder={need}
              value={text}
              autoComplete="off"
              error={invalid && !matches ? `Type ${need} exactly to continue.` : undefined}
              onChange={(v) => {
                setText(v);
                if (invalid) setInvalid(false);
              }}
              onEnter={tryConfirm}
            />
          </div>
        ) : null}
      </div>
      <div className="vu-dialog-foot" style={S('padding:6px 24px 24px;display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <SecondaryButton onClick={() => finish(false)}>
          {entry.cancelLabel}
        </SecondaryButton>
        <button
          type="button"
          data-autofocus={need ? undefined : true}
          aria-describedby={need && !matches ? `${entry.id}-require` : undefined}
          className={cx('vu-btn', H.press, entry.tone === 'danger' ? 'vu-btn-destroy' : 'vu-btn-primary')}
          onClick={tryConfirm}
          style={s(
            'display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none',
            'padding:0 18px;height:44px;border-radius:10px',
            // Until the typed text matches, it wears the shared disabled look
            // (mist fill, ink-3 label) but stays clickable, so a press shows
            // the field's error and puts focus there.
            matches
              ? `border:1px solid ${entry.tone === 'danger' ? C.emberDeep : C.ember};background:${entry.tone === 'danger' ? C.emberDeep : C.ember};color:#fff`
              : `border:1px solid ${C.mist};background:${C.mist};color:${C.ink3}`,
            `font:600 15px/1 ${F.body};cursor:pointer`,
            'transition:background .16s ease, transform .16s ease, opacity .16s ease'
          )}
        >
          {entry.confirmLabel}
        </button>
      </div>
    </>
  );
}

/* ---- anchored menu ------------------------------------------------------- */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** The next keyboard stop after `el` in document order, skipping hidden ones and open menus. */
function nextFocusable(el) {
  const all = Array.from(document.querySelectorAll(FOCUSABLE)).filter(
    (n) => !n.closest('[role="menu"]') && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden' && n.tabIndex >= 0
  );
  const after = all.find((n) => n !== el && !el.contains(n) && el.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING);
  return after || null;
}

function Menu({ menu }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  // Closing fades a copy out (leaveGhost), the way dialogs and toasts leave.
  useLayoutEffect(() => {
    const el = ref.current;
    return () => leaveGhost(el);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = menu.rect.left;
    let top = menu.rect.bottom + 6;
    if (left + w > window.innerWidth - 10) left = Math.max(10, menu.rect.right - w);
    if (top + h > window.innerHeight - 10) top = Math.max(10, menu.rect.top - h - 6);
    setPos({ left, top });
    // Focus the first item right away so arrow keys work on the first press.
    const first = el.querySelector('[data-menu-item]:not([disabled])');
    if (first) first.focus({ preventScroll: true });
    // On close, hand focus back to the control that opened the menu. Runs in
    // the layout phase, so a dialog opened by the picked item records that
    // control as the place to return to, instead of an unmounted menu item.
    const back = menu.returnFocus;
    return () => {
      if (!back || !back.isConnected || typeof back.focus !== 'function') return;
      const a = document.activeElement;
      if (!a || a === document.body || el.contains(a)) back.focus({ preventScroll: true });
    };
  }, [menu]);

  useEffect(() => {
    const outside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) closeMenu();
    };
    const onKey = (e) => {
      if (e.key === 'Tab') {
        // Tab leaves the menu: close it and carry on from the control that
        // opened it, the way a native select behaves.
        if (!ref.current || !ref.current.contains(document.activeElement)) return;
        e.preventDefault();
        const trigger = menu.returnFocus && menu.returnFocus.isConnected ? menu.returnFocus : null;
        const target = trigger ? (e.shiftKey ? trigger : nextFocusable(trigger) || trigger) : null;
        closeMenu();
        if (target) target.focus();
        return;
      }
      const items = ref.current ? Array.from(ref.current.querySelectorAll('[data-menu-item]:not([disabled])')) : [];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(i + 1) % items.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i - 1 + items.length) % items.length].focus();
      }
    };
    // Focus moving anywhere outside the menu (a screen reader's virtual
    // cursor, a script) closes it too, so no stale menu is left open to
    // swallow the next Escape. Checked a tick later, because opening a menu
    // can pass focus through its trigger on the way in.
    let focusTimer = 0;
    const onFocusIn = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        const a = document.activeElement;
        if (ref.current && a && a !== document.body && !ref.current.contains(a)) closeMenu();
      }, 0);
    };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn, true);
    return () => {
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn, true);
      clearTimeout(focusTimer);
    };
  }, [menu]);

  // An icon earns its place only when it tells an item apart. One that
  // repeats on several items (a flag on every project, a clipboard on every
  // template) is decoration, so it's left out; unique ones (the + on "New
  // project", the account menu's icons) stay.
  const iconCount = {};
  for (const it of menu.items) if (!it.sep && typeof it.icon === 'string') iconCount[it.icon] = (iconCount[it.icon] || 0) + 1;
  const iconFor = (it) => (typeof it.icon === 'string' && iconCount[it.icon] > 1 ? null : it.icon);

  return (
    <div ref={ref} className="vu-menu" role="menu" style={s(`left:${pos.left}px`, `top:${pos.top}px`)}>
      {menu.items.map((it, i) =>
        it.sep ? (
          <div key={`sep-${i}`} className="vu-menu-sep" role="separator" />
        ) : (
          <button
            key={it.key || i}
            type="button"
            role="menuitem"
            data-menu-item
            data-tone={it.tone || undefined}
            className="vu-menu-item"
            disabled={it.disabled}
            onClick={() => {
              closeMenu();
              menu.onPick && menu.onPick(it.key, it);
            }}
          >
            {renderIcon(iconFor(it), 18) ? (
              <span aria-hidden="true" style={S('display:grid;place-items:center;width:18px;color:inherit;opacity:.8')}>
                {renderIcon(iconFor(it), 18)}
              </span>
            ) : null}
            <span style={S('flex:1')}>{it.label}</span>
            {it.checked ? (
              <span style={S(`color:${C.ink}`)}>
                <Icon name="check" size={14} label="Selected" />
              </span>
            ) : null}
          </button>
        )
      )}
    </div>
  );
}
