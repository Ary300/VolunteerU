'use client';

/* ==========================================================================
   Marketing.jsx — public header and footer (design: landing chrome)
   ========================================================================== */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../lib/style.js';
import { useSnapshot } from '../lib/store.js';

const NAV = [
  { key: 'lead', label: 'Lead a project', href: '/lead' },
  { key: 'opps', label: 'Opportunities', href: '/discover' },
  { key: 'how', label: 'How it works', href: '/#how-it-works', anchor: 'how-it-works' },
  { key: 'schools', label: 'For schools', href: '/schools' },
];

const FOOTER = [
  { label: 'Opportunities', href: '/discover' },
  { label: 'Lead a project', href: '/lead' },
  { label: 'For schools', href: '/schools' },
  { label: 'Safety', href: '/safety' },
  { label: 'Privacy', href: '/privacy' },
];

export function MarketingHeader({ active = '' }) {
  const router = useRouter();
  const { state } = useSnapshot();
  const authed = state.session.authed;

  const goAnchor = (e, id) => {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div style={S('position:sticky;top:0;z-index:60;background:rgba(250,248,245,.82);backdrop-filter:blur(16px);border-bottom:1px solid rgba(232,225,217,.9)')}>
      <div
        className="vu-pad-32 vu-stack vu-stack-gap"
        style={S('max-width:1180px;margin:0 auto;padding:16px 32px;display:flex;align-items:center;justify-content:space-between')}
      >
        <div style={S('display:flex;align-items:center;gap:40px')}>
          <Link href="/" aria-label="VolunteerU home" style={S('display:flex;align-items:center;gap:9px;cursor:pointer;color:inherit')}>
            <div
              aria-hidden="true"
              style={S(
                'width:26px;height:26px;border-radius:8px;background:linear-gradient(150deg,#D2775B,#B14E2C);box-shadow:inset 0 1px 0 rgba(255,255,255,.35);display:grid;place-items:center;color:#fff;font:700 13px/1 Geist'
              )}
            >
              V
            </div>
            <div style={S('font:600 17px/1 Geist;letter-spacing:-0.03em')}>VolunteerU</div>
          </Link>
          <nav aria-label="Primary" style={S('display:flex;gap:26px;font:450 14px/1 Geist;color:#57504A')}>
            {NAV.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                className={H.toInk}
                aria-current={active === l.key ? 'page' : undefined}
                onClick={l.anchor ? (e) => goAnchor(e, l.anchor) : undefined}
                style={s('cursor:pointer;transition:color .16s ease;color:inherit', active === l.key ? 'color:#1A1714;font-weight:500' : '')}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div style={S('display:flex;align-items:center;gap:14px')}>
          <Link href={authed ? '/app' : '/signin'} className={H.toBrand} style={S('font:500 14px/1 Geist;color:#1A1714;cursor:pointer;transition:color .16s ease')}>
            {authed ? 'Open app' : 'Sign in'}
          </Link>
          <button
            type="button"
            onClick={() => router.push('/onboarding')}
            className={cx(H.primaryLift, H.press)}
            style={S(
              'display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 18px;height:40px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;letter-spacing:-0.01em;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 1px 2px rgba(80,30,12,.22), 0 8px 16px -8px rgba(150,60,30,.5);transition:transform .16s ease, box-shadow .16s ease, background .16s ease'
            )}
          >
            <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>
              ▷
            </span>
            Get started
          </button>
        </div>
      </div>
    </div>
  );
}

export function MarketingFooter() {
  return (
    <div style={S('border-top:1px solid #EFE9E2;background:#FCFAF8')}>
      <div
        className="vu-pad-32 vu-stack vu-stack-gap"
        style={S('max-width:1180px;margin:0 auto;padding:52px 32px;display:flex;align-items:center;justify-content:space-between')}
      >
        <Link href="/" aria-label="VolunteerU home" style={S('display:flex;align-items:center;gap:9px;cursor:pointer;color:inherit')}>
          <div
            aria-hidden="true"
            style={S('width:22px;height:22px;border-radius:7px;background:linear-gradient(150deg,#D2775B,#B14E2C);display:grid;place-items:center;color:#fff;font:700 11px/1 Geist')}
          >
            V
          </div>
          <div style={S('font:600 15px/1 Geist;letter-spacing:-0.03em')}>VolunteerU</div>
        </Link>
        <nav aria-label="Footer" style={S('display:flex;gap:26px;font:450 13px/1 Geist;color:#8A8179')}>
          {FOOTER.map((l) => (
            <Link key={l.label} href={l.href} className={H.toInk} style={S('cursor:pointer;transition:color .16s ease;color:inherit')}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div style={S("font:500 11px/1 'Geist Mono',monospace;color:#A9A097")}>© 2026</div>
      </div>
    </div>
  );
}
