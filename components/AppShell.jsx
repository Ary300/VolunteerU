'use client';

/* ==========================================================================
   AppShell.jsx, the app chrome.

   >= 1180px: a 248px white sidebar (sections, your projects, Saved and
   Notifications, the account button). Below that: a top bar (logo, Saved,
   Notifications, menu), a bottom tab bar with the five sections, and the
   sidebar as a drawer opened from the menu button. Layout lives in the
   .vu-app-shell / .vu-sidebar / .vu-mobilebar / .vu-tabbar classes in
   globals.css.

   Signed out (Discover is public), the sidebar keeps the same layout but
   drops the account's own links and offers Sign in / Create account, both
   carrying ?next= back to the page the visitor is on.
   ========================================================================== */

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { S, s, cx, H } from '../lib/style.js';
import { C, F, CAUSE } from '../lib/tokens.js';
import { Avatar, Icon } from './ui.jsx';
import { useSnapshot, useHydrated, updateEphemeral, eph } from '../lib/store.js';
import { sameSitePath } from '../lib/safePath.js';
import { menuFromEvent, confirmDialog, toast, hasOverlay } from '../lib/overlays.js';
import { signOut, effectiveStreak } from '../lib/db.js';
import { Logo } from './Logo.jsx';
import Tutorial from './Tutorial.jsx';
import FounderTutorial from './FounderTutorial.jsx';

/* Weeks in a row with logged volunteering. A quiet fact, shown only when there
   is one: no flame, no "keep it alive" nudge. */
function WeeksInARow({ weeks }) {
  if (!weeks) return null;
  return (
    <Link
      href="/profile"
      aria-label={`${weeks} ${weeks === 1 ? 'week' : 'weeks'} in a row, volunteering streak`}
      className="vu-proj-item"
      style={S(`gap:10px;font:500 13px/1.2 ${F.body}`)}
    >
      <Icon name="calendar" size={16} />
      <span>
        {weeks} {weeks === 1 ? 'week' : 'weeks'} in a row
      </span>
    </Link>
  );
}

const SIDE_NAV = [
  { k: 'home', label: 'Home', icon: 'home', href: '/app' },
  { k: 'discover', label: 'Discover', icon: 'compass', href: '/discover' },
  { k: 'crew', label: 'My crew', icon: 'users', href: '/crew' },
  { k: 'lead', label: 'Lead a project', icon: 'flag', href: '/lead' },
  { k: 'profile', label: 'Profile', icon: 'user', href: '/profile' },
];

/* What a visitor who isn't signed in sees: the public pages only. */
const SIDE_NAV_SIGNED_OUT = [
  { k: 'home', label: 'Home', icon: 'home', href: '/' },
  { k: 'discover', label: 'Discover', icon: 'compass', href: '/discover' },
];

/* Bottom tab bar labels on phones ("Lead a project" is too long for a tab). */
const TAB_LABEL = { lead: 'Lead' };

/** `?next=` pointing back at this page, so signing in returns the visitor here. */
function nextQuery(pathname, search) {
  const back = sameSitePath(`${pathname}${search ? `?${search}` : ''}`);
  return back ? `?next=${encodeURIComponent(back)}` : '';
}

function AuthLinks({ pathname, search, compact }) {
  const q = nextQuery(pathname, search);
  if (compact) {
    return (
      <Link
        href={`/signin${q}`}
        className={cx('vu-btn', 'vu-btn-outline', H.press)}
        style={S(`display:inline-flex;align-items:center;height:38px;padding:0 14px;border-radius:10px;border:1px solid ${C.line2};background:#fff;font:600 14px/1 ${F.body};color:${C.ink};white-space:nowrap`)}
      >
        Sign in
      </Link>
    );
  }
  return (
    <div style={S('display:flex;flex-direction:column;gap:8px;padding:0 4px')}>
      <p style={S(`margin:0 0 4px;padding:0 6px;font:400 13px/1.45 ${F.body};color:${C.ink2}`)}>Sign in to apply. Anything you save now moves to your account when you do.</p>
      <Link
        href={`/signup${q}`}
        className={cx('vu-btn', 'vu-btn-primary', H.press)}
        style={S(`display:flex;align-items:center;justify-content:center;height:44px;border-radius:10px;background:${C.ember};color:#fff;font:600 15px/1 ${F.body}`)}
      >
        Create account
      </Link>
      <Link
        href={`/signin${q}`}
        className={cx('vu-btn', 'vu-btn-outline', H.press)}
        style={S(`display:flex;align-items:center;justify-content:center;height:44px;border-radius:10px;border:1px solid ${C.line2};background:#fff;color:${C.ink};font:600 15px/1 ${F.body}`)}
      >
        Sign in
      </Link>
    </div>
  );
}

/* useSearchParams needs a Suspense boundary; the fallback keeps the links
   usable (path only) for the moment before the query string is read. */
function AuthLinksWithQuery({ pathname, compact }) {
  const params = useSearchParams();
  return <AuthLinks pathname={pathname} search={params ? params.toString() : ''} compact={compact} />;
}

function SignedOutLinks({ pathname, compact }) {
  return (
    <Suspense fallback={<AuthLinks pathname={pathname} search="" compact={compact} />}>
      <AuthLinksWithQuery pathname={pathname} compact={compact} />
    </Suspense>
  );
}

function CountPill({ n, tone }) {
  if (!n) return null;
  return <span className={tone === 'brand' ? 'vu-badge vu-badge--ember' : 'vu-badge'}>{n}</span>;
}

function NavItem({ href, on, icon, children, label, badge }) {
  return (
    <Link href={href} aria-current={on ? 'page' : undefined} aria-label={label} className="vu-nav-item">
      <span aria-hidden="true" className="vu-nav-ic">
        <Icon name={icon} size={20} />
      </span>
      {children}
      {badge}
    </Link>
  );
}

export function navKeyFor(pathname) {
  if (pathname === '/app') return 'home';
  if (/^\/crew/.test(pathname)) return 'crew';
  if (/^\/(discover|volunteers|opportunity|apply|friends|projects)/.test(pathname)) return 'discover';
  if (/^\/(lead|create)/.test(pathname)) return 'lead';
  // Settings is reached from the account menu and has no section of its own,
  // so nothing lights up there (CARDS 5). Profile stays for /profile only.
  if (/^\/profile/.test(pathname)) return 'profile';
  return '';
}

export default function AppShell({ children }) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const { state, ephemeral } = useSnapshot();
  const hydrated = useHydrated();
  const authed = !!state.session.authed;
  // Before the store hydrates nobody is known yet, so neither the account
  // button nor the sign-in links show.
  const signedOut = hydrated && !authed;
  const navItems = signedOut ? SIDE_NAV_SIGNED_OUT : SIDE_NAV;
  const homeHref = signedOut ? '/' : '/app';
  const activeKey = navKeyFor(pathname);
  const streak = effectiveStreak();
  const unread = (state.ui && state.ui.unreadNotifs) || 0;

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    if (ephemeral.sidebarOpen) updateEphemeral((e) => { e.sidebarOpen = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleRef = useRef(null);

  // Below 1180px the sidebar is an off-screen drawer. While it is closed it
  // is inert: no Tab stops and nothing for a screen reader on a panel nobody
  // can see.
  const [drawerMode, setDrawerMode] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(max-width: 1179px)');
    const on = () => setDrawerMode(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on);
    else mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, []);

  // The closed drawer leaves the name and grade out of its account button, so
  // the off-screen copy of the user's name never shadows the one the page
  // itself shows. They stay for the slide-out (--vu-dur-3 is 240ms).
  const [drawerAccount, setDrawerAccount] = useState(false);
  useEffect(() => {
    if (ephemeral.sidebarOpen) {
      setDrawerAccount(true);
      return undefined;
    }
    const t = setTimeout(() => setDrawerAccount(false), 260);
    return () => clearTimeout(t);
  }, [ephemeral.sidebarOpen]);
  const showAccount = !drawerMode || ephemeral.sidebarOpen || drawerAccount;

  // While the drawer is open (phones and tablets), Tab cycles between the
  // menu button and the drawer, so focus never lands on the page under the
  // scrim. Escape closes the drawer and puts focus back on the menu button.
  // Menus and dialogs take Escape first and stop it, so closing one of
  // those leaves the drawer open.
  useEffect(() => {
    if (!ephemeral.sidebarOpen) return undefined;
    const isDrawer = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 1179px)').matches;
    const stops = () => {
      const side = document.getElementById('vu-sidebar');
      const inside = side
        ? Array.from(side.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(
            (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
          )
        : [];
      return toggleRef.current ? [toggleRef.current, ...inside] : inside;
    };
    const onKey = (e) => {
      if (e.defaultPrevented || hasOverlay()) return;
      if (e.key === 'Escape') {
        updateEphemeral((x) => { x.sidebarOpen = false; });
        if (toggleRef.current) toggleRef.current.focus({ preventScroll: true });
        return;
      }
      if (e.key !== 'Tab' || !isDrawer()) return;
      const list = stops();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement);
      e.preventDefault();
      const next = i === -1 ? (e.shiftKey ? list[list.length - 1] : list[0]) : list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length];
      next.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ephemeral.sidebarOpen]);

  const closeDrawer = () => {
    if (eph().sidebarOpen) updateEphemeral((e) => { e.sidebarOpen = false; });
  };

  /* Without a connection, a client navigation can't fetch the next page and
     Next falls back to a full page load, which drops the user on the
     browser's offline error page. Keep them here and say why instead. */
  const isOffline = () => eph().online === false || (typeof navigator !== 'undefined' && navigator.onLine === false);
  const warnOffline = () =>
    toast({ title: "You're offline", message: 'That page needs a connection. Reconnect and try again.', tone: 'warn' });
  const go = (href) => {
    closeDrawer();
    if (isOffline()) warnOffline();
    else router.push(href);
  };

  // Capture phase, so this runs before next/link's own click handler, which
  // skips navigating when the event is already default-prevented.
  const onLinkClickCapture = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    if (a.closest('#vu-sidebar')) closeDrawer(); // also when the link is the page already open
    if (!isOffline() || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    let url;
    try { url = new URL(a.href, window.location.href); } catch { return; }
    if (url.origin !== window.location.origin) return;
    const samePage = url.pathname === window.location.pathname && url.search === window.location.search;
    if (samePage && url.hash) return; // in-page anchor, nothing to load
    e.preventDefault();
    if (!samePage) warnOffline();
  };

  const openAccountMenu = (e) => {
    menuFromEvent(
      e,
      [
        { key: 'profile', label: 'View profile', icon: 'user' },
        { key: 'notifications', label: unread ? `Notifications (${unread})` : 'Notifications', icon: 'bell' },
        { key: 'settings', label: 'Settings', icon: 'settings' },
        { sep: true },
        { key: 'help', label: 'Help and safety', icon: 'help' },
        { key: 'signout', label: 'Sign out', icon: 'log-out', tone: 'danger' },
      ],
      async (key) => {
        if (key === 'profile') go('/profile');
        else if (key === 'notifications') go('/notifications');
        else if (key === 'settings') go('/settings/account');
        else if (key === 'help') go('/safety');
        else if (key === 'signout') {
          const ok = await confirmDialog({
            title: 'Sign out?',
            body: 'Your hours and projects will be here when you sign back in.',
            confirmLabel: 'Sign out',
            cancelLabel: 'Stay signed in',
            tone: 'danger',
          });
          if (ok) {
            router.push('/');
            await signOut();
            toast({ title: 'Signed out', tone: 'ok' });
          }
        }
      }
    );
  };

  const savedCount = (state.saved || []).length;
  const tabItems = navItems;

  return (
    <div className="vu-app-shell" onClickCapture={onLinkClickCapture}>
      {/* phone and tablet top bar (hidden at >= 1180px) */}
      <div className="vu-mobilebar vu-noprint">
        <Link href={homeHref} aria-label="VolunteerU home" className="vu-brand">
          <Logo size={24} title="" />
          <span>VolunteerU</span>
        </Link>
        {signedOut ? (
          <SignedOutLinks pathname={pathname} compact />
        ) : authed ? (
          <>
            <Link
              href="/saved"
              aria-label={savedCount ? `Saved, ${savedCount}` : 'Saved'}
              aria-current={pathname.startsWith('/saved') ? 'page' : undefined}
              className="vu-iconbtn"
            >
              <Icon name="bookmark" size={22} />
            </Link>
            <Link
              href="/notifications"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
              aria-current={pathname.startsWith('/notifications') ? 'page' : undefined}
              className="vu-iconbtn"
            >
              <Icon name="bell" size={22} />
              {unread ? (
                <span aria-hidden="true" className="vu-iconbtn-dot">
                  {unread}
                </span>
              ) : null}
            </Link>
          </>
        ) : null}
        <button
          ref={toggleRef}
          type="button"
          className="vu-iconbtn"
          aria-label={ephemeral.sidebarOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={ephemeral.sidebarOpen ? 'true' : 'false'}
          aria-controls="vu-sidebar"
          onClick={() => updateEphemeral((e) => { e.sidebarOpen = !e.sidebarOpen; })}
        >
          <Icon name={ephemeral.sidebarOpen ? 'x' : 'menu'} size={22} />
        </button>
      </div>

      <div id="vu-sidebar" className="vu-sidebar" data-open={ephemeral.sidebarOpen ? 'true' : 'false'} inert={drawerMode && !ephemeral.sidebarOpen ? true : undefined}>
        <div>
          <Link href={homeHref} aria-label="VolunteerU home" className="vu-brand vu-hide-mobile">
            <Logo size={28} title="" />
            <span>VolunteerU</span>
          </Link>
          <nav aria-label="Sections" style={S('display:flex;flex-direction:column;gap:2px')}>
            {navItems.map((n) => (
              <NavItem key={n.k} href={n.href} on={activeKey === n.k} icon={n.icon}>
                {n.label}
              </NavItem>
            ))}
          </nav>

          {(() => {
            const mine = authed ? state.projects.filter((p) => !p.archived) : [];
            if (!mine.length) return null;
            return (
              <div style={S('margin-top:22px')}>
                <div className="vu-nav-group">Your projects</div>
                <div style={S('margin-top:8px;display:flex;flex-direction:column;gap:2px')}>
                  {mine.map((p) => {
                    const on = pathname.startsWith(`/lead/${p.id}`);
                    return (
                      <Link key={p.id} href={`/lead/${p.id}/overview`} aria-current={on ? 'page' : undefined} className="vu-proj-item">
                        <span aria-hidden="true" style={s('width:8px;height:8px;border-radius:50%;flex:none', `background:${p.orgType === 'team' ? CAUSE.civic.fg : C.confirmed}`)} />
                        <span className="vu-trunc" style={S('min-width:0')}>{p.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {authed ? (
            <>
              <div className="vu-nav-sep" />
              <div style={S('display:flex;flex-direction:column;gap:2px')}>
                <NavItem href="/saved" on={pathname.startsWith('/saved')} icon="bookmark" badge={<CountPill n={savedCount} />}>
                  Saved
                </NavItem>
                <NavItem
                  href="/notifications"
                  on={pathname.startsWith('/notifications')}
                  icon="bell"
                  label={`Notifications${unread ? `, ${unread} unread` : ''}`}
                  badge={<CountPill n={unread} tone="brand" />}
                >
                  Notifications
                </NavItem>
              </div>
            </>
          ) : null}
        </div>

        {signedOut ? (
          <SignedOutLinks pathname={pathname} />
        ) : authed ? (
          <div>
            <WeeksInARow weeks={streak} />
            <button type="button" aria-label="Account menu" aria-haspopup="menu" className={cx('vu-me', H.press)} onClick={openAccountMenu} style={S('margin-top:6px')}>
              <div style={S('width:38px;height:38px;border-radius:50%;overflow:hidden;flex:none')}>
                <Avatar name={state.account.name} src={state.account.avatar} fs={14} />
              </div>
              <div style={S('min-width:0;flex:1')}>
                {showAccount ? (
                  <>
                    <div className="vu-trunc" style={S(`font:600 14px/1.2 ${F.body};color:${C.ink}`)}>{state.account.name || 'Your account'}</div>
                    <div className="vu-trunc" style={S(`margin-top:3px;font:400 12.5px/1.2 ${F.body};color:${C.ink2}`)}>
                      {[state.account.grade ? `Grade ${state.account.grade}` : null, String(state.account.city || '').split(',')[0] || null].filter(Boolean).join(', ') || 'Set up your profile'}
                    </div>
                  </>
                ) : null}
              </div>
              <span aria-hidden="true" style={S(`color:${C.ink3}`)}>
                <Icon name="more" size={18} stroke={2.25} />
              </span>
            </button>
          </div>
        ) : null}
      </div>

      {ephemeral.sidebarOpen ? (
        <div
          aria-hidden="true"
          onClick={() => {
            closeDrawer();
            if (toggleRef.current) toggleRef.current.focus({ preventScroll: true });
          }}
          className="vu-drawer-scrim"
          style={S(`position:fixed;inset:0;z-index:199;background:${C.scrim}`)} />
      ) : null}

      <div id="vu-main" className="vu-main-pad">
        {children}
      </div>

      {/* phone and tablet tab bar (hidden at >= 1180px) */}
      {hydrated ? (
        <nav aria-label="Main" className="vu-tabbar vu-noprint" style={{ '--vu-tabs': tabItems.length }}>
          {tabItems.map((n) => {
            const on = activeKey === n.k;
            return (
              <Link key={n.k} href={n.href} aria-current={on ? 'page' : undefined} className="vu-tab-item">
                <Icon name={n.icon} size={24} stroke={on ? 1.75 : 1.5} />
                <span>{TAB_LABEL[n.k] || n.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
      <Tutorial />
      <FounderTutorial />
    </div>
  );
}
