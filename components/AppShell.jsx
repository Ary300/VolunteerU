'use client';

/* ==========================================================================
   AppShell.jsx, the signed-in chrome (design: the `inApp` two-column grid)
   ========================================================================== */

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { S, s, cx, H } from '../lib/style.js';
import { Avatar, Icon } from './ui.jsx';
import { useSnapshot, updateEphemeral, eph } from '../lib/store.js';
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
      className={H.nav}
      style={S('display:flex;align-items:center;gap:10px;padding:10px;border-radius:9px;color:#6B635C;font:450 13px/1.2 Geist;transition:background .16s ease')}
    >
      <Icon name="calendar" size={15} />
      <span>
        {weeks} {weeks === 1 ? 'week' : 'weeks'} in a row
      </span>
    </Link>
  );
}

const SIDE_NAV = [
  { k: 'home', label: 'Home', icon: 'home', href: '/app' },
  { k: 'discover', label: 'Discover', icon: 'search', href: '/discover' },
  { k: 'crew', label: 'My crew', icon: 'users', href: '/crew' },
  { k: 'lead', label: 'Lead a project', icon: 'flag', href: '/lead' },
  { k: 'profile', label: 'Profile', icon: 'user', href: '/profile' },
];

const navItemStyle = (on) =>
  s(
    'display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:9px;cursor:pointer',
    `background:${on ? '#F2ECE5' : 'transparent'}`,
    `color:${on ? '#1A1714' : '#6B635C'}`,
    'font-family:Geist;font-size:14px;line-height:1',
    `font-weight:${on ? '600' : '450'}`,
    'transition:background .16s ease'
  );

const groupLabel = S('padding:0 10px;font:500 12px/1 Geist;color:#8A8179');

function CountPill({ n, tone }) {
  if (!n) return null;
  return (
    <span
      style={s(
        'margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:10px;display:inline-grid;place-items:center',
        "font:500 11px/1 'Geist Mono',monospace",
        tone === 'brand' ? 'background:#C2603C;color:#fff' : 'background:#F2ECE5;color:#57504A'
      )}
    >
      {n}
    </span>
  );
}

export function navKeyFor(pathname) {
  if (pathname === '/app') return 'home';
  if (/^\/crew/.test(pathname)) return 'crew';
  if (/^\/(discover|volunteers|opportunity|apply|friends|projects)/.test(pathname)) return 'discover';
  if (/^\/(lead|create)/.test(pathname)) return 'lead';
  if (/^\/(profile|settings)/.test(pathname)) return 'profile';
  return '';
}

export default function AppShell({ children }) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const { state, ephemeral } = useSnapshot();
  const activeKey = navKeyFor(pathname);
  const streak = effectiveStreak();
  const unread = (state.ui && state.ui.unreadNotifs) || 0;

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    if (ephemeral.sidebarOpen) updateEphemeral((e) => { e.sidebarOpen = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape closes the open drawer. Menus and dialogs take Escape first and
  // stop it, so closing one of those leaves the drawer open.
  useEffect(() => {
    if (!ephemeral.sidebarOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !hasOverlay()) updateEphemeral((x) => { x.sidebarOpen = false; });
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

  return (
    <div className="vu-app-shell vu-fixed-width" onClickCapture={onLinkClickCapture} style={S('display:grid;grid-template-columns:236px 1fr;min-height:100vh;min-width:1180px;background:#FAF8F5')}>
      {/* mobile bar (hidden at >= 1180px, so the design is untouched) */}
      <div className="vu-mobilebar vu-noprint">
        <button
          type="button"
          className="vu-burger"
          aria-label={ephemeral.sidebarOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={ephemeral.sidebarOpen ? 'true' : 'false'}
          aria-controls="vu-sidebar"
          onClick={() => updateEphemeral((e) => { e.sidebarOpen = !e.sidebarOpen; })}
        >
          <Icon name={ephemeral.sidebarOpen ? 'x' : 'menu'} size={18} />
        </button>
        <Link href="/app" aria-label="VolunteerU home" style={S('display:flex;align-items:center;gap:8px;color:#1A1714')}>
          <Logo size={22} title="" />
          <span style={S('font:600 15px/1 Geist;letter-spacing:-0.03em')}>VolunteerU</span>
        </Link>
        <Link
          href="/notifications"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          aria-current={pathname.startsWith('/notifications') ? 'page' : undefined}
          style={S('margin-left:auto;position:relative;width:36px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;display:grid;place-items:center;color:#57504A')}
        >
          <Icon name="bell" size={17} />
          {unread ? (
            <span aria-hidden="true" style={S('position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#C2603C;color:#fff;font:600 9px/16px Geist;text-align:center')}>{unread}</span>
          ) : null}
        </Link>
      </div>

      <div
        id="vu-sidebar"
        className="vu-sidebar"
        data-open={ephemeral.sidebarOpen ? 'true' : 'false'}
        style={S('position:sticky;top:0;height:100vh;overflow-y:auto;border-right:1px solid #E8E1D9;background:#fff;padding:24px 16px;display:flex;flex-direction:column;justify-content:space-between;gap:18px')}
      >
        <div>
          <Link href="/app" aria-label="VolunteerU home" className="vu-hide-mobile" style={S('display:flex;align-items:center;gap:9px;padding:0 8px 22px;cursor:pointer;color:inherit')}>
            <Logo size={24} title="" />
            <div style={S('font:600 16px/1 Geist;letter-spacing:-0.03em')}>VolunteerU</div>
          </Link>
          <nav aria-label="Sections" style={S('display:flex;flex-direction:column;gap:2px')}>
            {SIDE_NAV.map((n) => {
              const on = activeKey === n.k;
              return (
                <Link
                  key={n.k}
                  href={n.href}
                  aria-current={on ? 'page' : undefined}
                  className={on ? undefined : H.nav}
                  style={navItemStyle(on)}
                >
                  <span aria-hidden="true" style={s('display:grid;place-items:center', on ? 'color:#C2603C' : 'opacity:.75')}>
                    <Icon name={n.icon} size={16} />
                  </span>
                  {n.label}
                </Link>
              );
            })}
          </nav>

          {(() => {
            const mine = state.projects.filter((p) => !p.archived);
            if (!mine.length) return null;
            return (
              <div style={S('margin-top:18px')}>
                <div style={groupLabel}>Your projects</div>
                <div style={S('margin-top:10px;display:flex;flex-direction:column;gap:2px')}>
                  {mine.map((p) => {
                    const on = pathname.startsWith(`/lead/${p.id}`);
                    return (
                      <Link
                        key={p.id}
                        href={`/lead/${p.id}/overview`}
                        aria-current={on ? 'page' : undefined}
                        className={on ? undefined : H.nav}
                        style={s(
                          'display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;cursor:pointer;color:inherit;transition:background .16s ease',
                          `background:${on ? '#F2ECE5' : 'transparent'}`,
                          `font:${on ? '600' : '450'} 13px/1.2 Geist`,
                          `color:${on ? '#1A1714' : '#6B635C'}`
                        )}
                      >
                        <span aria-hidden="true" style={s('width:7px;height:7px;border-radius:50%;flex:none', `background:${p.orgType === 'team' ? '#5B6BB0' : '#C2603C'}`)} />
                        <span className="vu-trunc" style={S('min-width:0')}>{p.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div style={S('height:1px;background:#EFE9E2;margin:18px 8px')} />
          <div style={S('display:flex;flex-direction:column;gap:2px')}>
            {(() => {
              const on = pathname.startsWith('/saved');
              return (
                <Link href="/saved" aria-current={on ? 'page' : undefined} className={on ? undefined : H.nav} style={navItemStyle(on)}>
                  <span aria-hidden="true" style={s('display:grid;place-items:center', on ? 'color:#C2603C' : 'opacity:.75')}>
                    <Icon name="bookmark" size={16} />
                  </span>
                  Saved
                  <CountPill n={state.saved.length} />
                </Link>
              );
            })()}
            {(() => {
              const on = pathname.startsWith('/notifications');
              return (
                <Link
                  href="/notifications"
                  aria-current={on ? 'page' : undefined}
                  aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
                  className={on ? undefined : H.nav}
                  style={navItemStyle(on)}
                >
                  <span aria-hidden="true" style={s('display:grid;place-items:center', on ? 'color:#C2603C' : 'opacity:.75')}>
                    <Icon name="bell" size={16} />
                  </span>
                  Notifications
                  <CountPill n={unread} tone="brand" />
                </Link>
              );
            })()}
          </div>
        </div>

        <div>
          <WeeksInARow weeks={streak} />
          <button
            type="button"
            aria-label="Account menu"
            aria-haspopup="menu"
            className={cx(H.nav, H.press)}
            onClick={openAccountMenu}
            style={S('margin-top:8px;display:flex;width:100%;align-items:center;gap:10px;padding:8px;border-radius:10px;cursor:pointer;transition:background .16s ease')}
          >
            <div style={S('width:30px;height:30px;border-radius:50%;overflow:hidden;flex:none')}>
              <Avatar name={state.account.name} src={state.account.avatar} fs={12} />
            </div>
            <div style={S('min-width:0;flex:1;text-align:left')}>
              <div className="vu-trunc" style={S('font:600 13px/1.2 Geist')}>{state.account.name || 'Your account'}</div>
              <div className="vu-trunc" style={S('font:450 11px/1.2 Geist;color:#8A8179;margin-top:2px')}>
                {[state.account.grade ? `Grade ${state.account.grade}` : null, String(state.account.city || '').split(',')[0] || null].filter(Boolean).join(', ') || 'Set up your profile'}
              </div>
            </div>
            <span aria-hidden="true" style={S('color:#A9A097')}>
              <Icon name="more" size={16} stroke={2.5} />
            </span>
          </button>
        </div>
      </div>

      {ephemeral.sidebarOpen ? (
        <div
          aria-hidden="true"
          onClick={closeDrawer}
          className="vu-drawer-scrim"
          style={S('position:fixed;inset:0;z-index:199;background:rgba(31,27,24,.3)')}
        />
      ) : null}

      <div id="vu-main" className="vu-main-pad">
        {children}
      </div>
      <Tutorial />
      <FounderTutorial />
    </div>
  );
}
