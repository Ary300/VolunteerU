'use client';

/* ==========================================================================
   AppShell.jsx, the signed-in chrome (design: the `inApp` two-column grid)
   ========================================================================== */

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { S, s, cx, H } from '../lib/style.js';
import { ImageSlot } from './ui.jsx';
import { useSnapshot, updateEphemeral } from '../lib/store.js';
import { menuFromEvent, confirmDialog, toast } from '../lib/overlays.js';
import { signOut, effectiveStreak } from '../lib/db.js';
import { Logo } from './Logo.jsx';
import Tutorial from './Tutorial.jsx';
import FounderTutorial from './FounderTutorial.jsx';

const MONO = "'Geist Mono',monospace";

/* Weekly volunteering streak, the flame animates in on every visit, and the
   count pops when it changes. Keyframes live in globals.css (vu-flame, vu-pop). */
function StreakCard({ weeks }) {
  const active = weeks > 0;
  return (
    <Link
      href="/profile"
      aria-label={`Volunteering streak: ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`}
      className={H.card}
      style={S('display:block;padding:14px;border-radius:12px;background:#FAF6F3;border:1px solid #EFE3DC;cursor:pointer;color:inherit;transition:border-color .16s ease')}
    >
      <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Weekly streak</div>
      <div style={S('margin-top:9px;display:flex;align-items:center;gap:9px')}>
        <span
          aria-hidden="true"
          className={active ? 'vu-flame' : undefined}
          style={s('font-size:22px;line-height:1', active ? 'filter:none' : 'filter:grayscale(1);opacity:.5')}
        >
          🔥
        </span>
        <span key={weeks} className="vu-pop" style={S('font:600 22px/1 Geist;letter-spacing:-0.03em;color:#1A1714')}>
          {weeks}
          <span style={S('font-size:13px;color:#8A8179;font-weight:450')}> {weeks === 1 ? 'week' : 'weeks'}</span>
        </span>
      </div>
      <div style={S('margin-top:9px;display:flex;gap:5px')}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            aria-hidden="true"
            style={s('flex:1;height:4px;border-radius:3px', i < Math.min(weeks, 5) ? 'background:#C2603C' : 'background:#EFE3DC')}
          />
        ))}
      </div>
      <div style={S('margin-top:9px;font:450 11px/1.4 Geist;color:#8A8179')}>
        {active ? 'Log a shift each week to keep it alive.' : 'Log volunteering to start a streak.'}
      </div>
    </Link>
  );
}

const SIDE_NAV = [
  { k: 'home', label: 'Home', icon: '◇', href: '/app' },
  { k: 'discover', label: 'Discover', icon: '◎', href: '/discover' },
  { k: 'crew', label: 'My crew', icon: '❖', href: '/crew' },
  { k: 'lead', label: 'Lead a project', icon: '◈', href: '/lead' },
  { k: 'profile', label: 'Profile', icon: '☺', href: '/profile' },
];

export function navKeyFor(pathname) {
  if (pathname === '/app') return 'home';
  if (/^\/crew/.test(pathname)) return 'crew';
  if (/^\/(discover|volunteers|opportunity|apply|saved|friends|projects)/.test(pathname)) return 'discover';
  if (/^\/(lead|create)/.test(pathname)) return 'lead';
  if (/^\/(profile|settings|notifications)/.test(pathname)) return 'profile';
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

  const openAccountMenu = (e) => {
    menuFromEvent(
      e,
      [
        { key: 'profile', label: 'View profile', icon: '☺' },
        { key: 'notifications', label: unread ? `Notifications (${unread})` : 'Notifications', icon: '☰' },
        { key: 'settings', label: 'Settings', icon: '⚙' },
        { sep: true },
        { key: 'help', label: 'Help and safety', icon: '?' },
        { key: 'signout', label: 'Sign out', icon: '⇥', tone: 'danger' },
      ],
      async (key) => {
        if (key === 'profile') router.push('/profile');
        else if (key === 'notifications') router.push('/notifications');
        else if (key === 'settings') router.push('/settings/account');
        else if (key === 'help') router.push('/safety');
        else if (key === 'signout') {
          const ok = await confirmDialog({
            title: 'Sign out of VolunteerU?',
            body: 'Your record, projects and drafts stay on this device and will be here when you sign back in.',
            confirmLabel: 'Sign out',
            tone: 'danger',
          });
          if (ok) {
            signOut();
            toast({ title: 'Signed out', message: 'See you next Saturday.', tone: 'ok' });
            router.push('/');
          }
        }
      }
    );
  };

  return (
    <div className="vu-app-shell vu-fixed-width" style={S('display:grid;grid-template-columns:236px 1fr;min-height:100vh;min-width:1180px;background:#FAF8F5')}>
      {/* mobile bar (hidden at >= 1180px, so the design is untouched) */}
      <div className="vu-mobilebar vu-noprint">
        <button type="button" className="vu-burger" aria-label="Open navigation" onClick={() => updateEphemeral((e) => { e.sidebarOpen = !e.sidebarOpen; })}>
          <i /><i /><i />
        </button>
        <div style={S('display:flex;align-items:center;gap:8px')}>
          <Logo size={22} />
          <div style={S('font:600 15px/1 Geist;letter-spacing:-0.03em')}>VolunteerU</div>
        </div>
        <Link
          href="/notifications"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          style={S('margin-left:auto;position:relative;width:36px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;display:grid;place-items:center;font-size:14px;color:#57504A')}
        >
          ☰
          {unread ? (
            <span style={S('position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#C2603C;color:#fff;font:600 9px/16px Geist;text-align:center')}>{unread}</span>
          ) : null}
        </Link>
      </div>

      <div
        className="vu-sidebar"
        data-open={ephemeral.sidebarOpen ? 'true' : 'false'}
        style={S('border-right:1px solid #E8E1D9;background:#fff;background-image:repeating-linear-gradient(135deg,rgba(31,27,24,.012) 0 1px,transparent 1px 6px);padding:24px 16px;display:flex;flex-direction:column;justify-content:space-between')}
      >
        <div>
          <Link href="/" aria-label="VolunteerU home" style={S('display:flex;align-items:center;gap:9px;padding:0 8px 22px;cursor:pointer;color:inherit')}>
            <Logo size={24} />
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
                  style={s(
                    'display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:9px;cursor:pointer',
                    `background:${on ? '#F2ECE5' : 'transparent'}`,
                    `color:${on ? '#1A1714' : '#6B635C'}`,
                    'font-family:Geist;font-size:14px;line-height:1',
                    `font-weight:${on ? '600' : '450'}`,
                    'transition:background .16s ease'
                  )}
                >
                  <span aria-hidden="true" style={S('font-size:12px;opacity:.55')}>{n.icon}</span>
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
                <div style={S(`padding:0 10px;font:500 10px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#BEB5AC`)}>Your projects</div>
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
          <div style={S(`padding:0 10px;font:500 10px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#BEB5AC`)}>Saved</div>
          <div style={S('margin-top:10px;display:flex;flex-direction:column;gap:2px;font:450 14px/1 Geist;color:#6B635C')}>
            <Link href="/saved" className={H.nav} style={S('padding:10px;border-radius:9px;cursor:pointer;color:inherit;transition:background .16s ease')}>
              Shortlist · {state.saved.length}
            </Link>
          </div>
        </div>

        <div>
          <StreakCard weeks={streak} />
          <button
            type="button"
            aria-label="Account menu"
            aria-haspopup="menu"
            className={cx(H.nav, H.press)}
            onClick={openAccountMenu}
            style={S('margin-top:14px;display:flex;width:100%;align-items:center;gap:10px;padding:8px;border-radius:10px;cursor:pointer;transition:background .16s ease')}
          >
            <div style={S('width:30px;height:30px;border-radius:50%;overflow:hidden;flex:none')}>
              <ImageSlot src={state.account.avatar} shape="circle" placeholder="avatar" />
            </div>
            <div style={S('min-width:0;text-align:left')}>
              <div className="vu-trunc" style={S('font:600 13px/1.2 Geist')}>{state.account.name || 'Your account'}</div>
              <div className="vu-trunc" style={S('font:450 11px/1.2 Geist;color:#8A8179;margin-top:2px')}>
                {[state.account.grade ? `Grade ${state.account.grade}` : null, String(state.account.city || '').split(',')[0] || null].filter(Boolean).join(' · ') || 'Set up your profile'}
              </div>
            </div>
          </button>
        </div>
      </div>

      {ephemeral.sidebarOpen ? (
        <div
          aria-hidden="true"
          onClick={() => updateEphemeral((e) => { e.sidebarOpen = false; })}
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
