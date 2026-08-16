'use client';

/* ==========================================================================
   ScreenNav.jsx — the design's fixed screen switcher (bottom-left)
   Present on every screen in `VolunteerU Design.dc.html`; each entry is a real
   route rather than a prototype state toggle.
   ========================================================================== */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { S, s } from '../lib/style.js';

const ITEMS = [
  { key: 'landing', label: 'Landing', href: '/', match: (p) => p === '/' },
  { key: 'onboard', label: 'Onboarding', href: '/onboarding', match: (p) => p.startsWith('/onboarding') },
  { key: 'home', label: 'Home', href: '/app', match: (p) => p === '/app' },
  { key: 'discover', label: 'Discover', href: '/discover', match: (p) => p.startsWith('/discover') },
  { key: 'detail', label: 'Opportunity', href: '/opportunity/opp-food-dist', match: (p) => p.startsWith('/opportunity') },
  { key: 'apply', label: 'Apply', href: '/apply/opp-food-dist', match: (p) => p.startsWith('/apply') },
  { key: 'lead', label: 'Lead', href: '/lead', match: (p) => p.startsWith('/lead') },
  { key: 'create', label: 'New project', href: '/create', match: (p) => p.startsWith('/create') },
  { key: 'profile', label: 'Profile', href: '/profile', match: (p) => p.startsWith('/profile') },
];

export default function ScreenNav() {
  const pathname = usePathname() || '/';

  // Developer-only screen switcher. Never shown in the real (production) app.
  if (process.env.NODE_ENV === 'production') return null;

  return (
    <nav
      className="vu-devnav vu-noprint"
      aria-label="Screens"
      style={S(
        'position:fixed;z-index:80;bottom:14px;left:14px;display:flex;gap:2px;padding:3px;border-radius:14px;background:rgba(255,255,255,.86);backdrop-filter:blur(14px);border:1px solid #E8E1D9;box-shadow:0 8px 24px -12px rgba(60,40,25,.28)'
      )}
    >
      <div
        aria-hidden="true"
        style={S(
          "font:500 11px/1 'Geist Mono',monospace;color:#9A9088;letter-spacing:.06em;text-transform:uppercase;padding:7px 8px;border-right:1px solid #EFE9E2;margin-right:2px"
        )}
      >
        VU
      </div>
      {ITEMS.map((item) => {
        const on = item.match(pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            style={s(
              'padding:7px 10px;border-radius:8px;font:500 12px/1 Geist;letter-spacing:-0.01em;cursor:pointer',
              `color:${on ? '#FFFFFF' : '#57504A'}`,
              `background:${on ? '#1F1B18' : 'transparent'}`,
              'transition:background .16s ease, color .16s ease'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
