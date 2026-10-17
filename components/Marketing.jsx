'use client';

/* ==========================================================================
   Marketing.jsx, public header and footer (design: landing chrome)
   Signed-out visitors can't open /discover or /lead (Providers.jsx guards
   them), so their links point at the landing page's own search and sections
   instead of bouncing to a sign-in form.
   ========================================================================== */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../lib/style.js';
import { useSnapshot } from '../lib/store.js';
import { Logo } from './Logo.jsx';

const MONO = "'Geist Mono',monospace";

/* Flat button fills and the responsive rules for the marketing pages. Lives
   here because every marketing page renders MarketingHeader. */
const MARKETING_CSS = `
.lp-btn { background:#C2603C; border:1px solid #A8482A; color:#fff; transition:background .16s ease, transform .16s ease; }
.lp-btn-ghost { background:#fff; border:1px solid #E4DDD4; color:#1A1714; transition:background .16s ease, border-color .16s ease; }
.lp-link { color:#C2603C; text-decoration:none; }
@media (hover:hover) {
  .lp-btn:hover { background:#B05434; }
  .lp-btn-ghost:hover { background:#FBF7F3; border-color:#D8CEC3; }
  .lp-link:hover { text-decoration:underline; text-underline-offset:3px; }
  .lp-row:hover { background:#FCFAF8; }
  .lp-chip:hover { border-color:#D8CEC3; background:#FBF7F3; }
}
.lp-btn:active, .lp-btn-ghost:active { transform:scale(.985); }
@media (prefers-reduced-motion: reduce) {
  .lp-btn, .lp-btn-ghost { transition:none; }
  .lp-btn:active, .lp-btn-ghost:active { transform:none; }
}
@media (max-width: 720px) {
  .lp-head-nav { display:none !important; }
  .lp-head-row { padding:12px 16px !important; }
  .lp-head-right { gap:10px !important; }
  .lp-foot { flex-direction:column !important; align-items:flex-start !important; gap:20px !important; padding:36px 16px !important; }
  .lp-foot-nav { flex-wrap:wrap; gap:14px 20px !important; }
}
`;

export function MarketingStyles() {
  return <style dangerouslySetInnerHTML={{ __html: MARKETING_CSS }} />;
}

/** Where the marketing links go for this visitor. */
export function useMarketingLinks() {
  const { state } = useSnapshot();
  const authed = Boolean(state.session.authed);
  return {
    authed,
    opportunities: authed ? '/discover' : '/#search',
    projects: authed ? '/lead' : '/#student-projects',
    startProject: authed ? '/create' : '/signup?intent=start',
    signUp: '/signup',
  };
}

/* Smooth-scroll to an in-page anchor when it exists on this page; otherwise
   let the link navigate to the landing page, which scrolls to the hash. */
export function scrollToAnchor(e, href) {
  const hash = String(href || '').split('#')[1];
  if (!hash || typeof document === 'undefined') return;
  const el = document.getElementById(hash);
  if (!el) return;
  e.preventDefault();
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  if (hash === 'search') {
    const input = document.getElementById('lp-what');
    if (input) setTimeout(() => input.focus({ preventScroll: true }), reduce ? 0 : 350);
  }
  if (window.history && window.history.replaceState) window.history.replaceState(null, '', `#${hash}`);
}

export function MarketingHeader({ active = '' }) {
  const router = useRouter();
  const links = useMarketingLinks();
  const nav = [
    { key: 'opps', label: 'Opportunities', href: links.opportunities },
    { key: 'lead', label: 'Student projects', href: links.projects },
    { key: 'how', label: 'How it works', href: '/#how-it-works' },
    { key: 'schools', label: 'For schools', href: '/schools' },
  ];

  return (
    <div style={S('position:sticky;top:0;z-index:60;background:rgba(250,248,245,.92);backdrop-filter:blur(16px);border-bottom:1px solid rgba(232,225,217,.9)')}>
      <MarketingStyles />
      <div
        className="vu-pad-32 lp-head-row"
        style={S('max-width:1180px;margin:0 auto;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;gap:16px')}
      >
        <div style={S('display:flex;align-items:center;gap:40px;min-width:0')}>
          <Link href="/" aria-label="VolunteerU home" style={S('display:flex;align-items:center;gap:9px;cursor:pointer;color:inherit;flex:none')}>
            <Logo size={27} />
            <div style={S('font:600 17px/1 Geist;letter-spacing:-0.03em')}>VolunteerU</div>
          </Link>
          <nav aria-label="Primary" className="vu-hide-mobile lp-head-nav" style={S('display:flex;gap:26px;font:450 14px/1 Geist;color:#57504A')}>
            {nav.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                className={H.toInk}
                aria-current={active === l.key ? 'page' : undefined}
                onClick={l.href.includes('#') ? (e) => scrollToAnchor(e, l.href) : undefined}
                style={s('cursor:pointer;transition:color .16s ease;color:inherit;white-space:nowrap', active === l.key ? 'color:#1A1714;font-weight:500' : '')}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="lp-head-right" style={S('display:flex;align-items:center;gap:14px;flex:none')}>
          <Link href={links.authed ? '/app' : '/signin'} className={H.toBrand} style={S('font:500 14px/1 Geist;color:#1A1714;cursor:pointer;transition:color .16s ease;white-space:nowrap')}>
            {links.authed ? 'Open app' : 'Sign in'}
          </Link>
          <button
            type="button"
            onClick={() => router.push(links.authed ? '/discover' : links.signUp)}
            className={cx('lp-btn', H.press)}
            style={S('display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 16px;height:40px;border-radius:12px;font:600 14px/1 Geist;letter-spacing:-0.01em;cursor:pointer')}
          >
            {links.authed ? 'Search opportunities' : 'Sign up free'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MarketingFooter() {
  const links = useMarketingLinks();
  const footer = [
    { label: 'Opportunities', href: links.opportunities },
    { label: 'Student projects', href: links.projects },
    { label: 'For schools', href: '/schools' },
    { label: 'Safety', href: '/safety' },
    { label: 'Privacy', href: '/privacy' },
  ];
  return (
    <div style={S('border-top:1px solid #EFE9E2;background:#FCFAF8')}>
      <div
        className="vu-pad-32 lp-foot"
        style={S('max-width:1180px;margin:0 auto;padding:52px 32px;display:flex;align-items:center;justify-content:space-between;gap:24px')}
      >
        <Link href="/" aria-label="VolunteerU home" style={S('display:flex;align-items:center;gap:9px;cursor:pointer;color:inherit')}>
          <Logo size={22} />
          <div style={S('font:600 15px/1 Geist;letter-spacing:-0.03em')}>VolunteerU</div>
        </Link>
        <nav aria-label="Footer" className="lp-foot-nav" style={S('display:flex;gap:26px;font:450 13px/1 Geist;color:#6B635C')}>
          {footer.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className={H.toInk}
              onClick={l.href.includes('#') ? (e) => scrollToAnchor(e, l.href) : undefined}
              style={S('cursor:pointer;transition:color .16s ease;color:inherit')}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div style={S(`font:500 11px/1 ${MONO};color:#8A8179`)}>© 2026</div>
      </div>
    </div>
  );
}
