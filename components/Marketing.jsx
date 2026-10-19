'use client';

/* ==========================================================================
   Marketing.jsx, public header and footer (design: landing chrome)
   Signed-out visitors can't open /discover or /lead (Providers.jsx guards
   them), so their links point at the landing page's own search and sections
   instead of bouncing to a sign-in form.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { S } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import { useSnapshot } from '../lib/store.js';
import { Button, IconButton } from './ui.jsx';
import { Logo } from './Logo.jsx';

/* Layout and states for the marketing chrome and the shared page frame
   (.mk-wrap). Lives here because every marketing page renders
   MarketingHeader. Inline styles can't do hover, focus or media queries. */
const MARKETING_CSS = `
.mk-wrap { max-width:1440px; margin:0 auto; padding:0 64px; }
.mk-head { position:sticky; top:0; z-index:60; background:#fff; box-shadow:inset 0 -1px 0 ${C.line}; }
.mk-head-row { height:76px; display:flex; align-items:center; gap:40px; }
.mk-brand { display:flex; align-items:center; gap:10px; flex:none; color:${C.ink}; font:700 21px/1 ${F.display}; letter-spacing:-0.02em; }
.mk-nav { display:flex; gap:28px; font:500 15px/1 ${F.body}; color:${C.ink2}; min-width:0; }
.mk-nav a { color:inherit; white-space:nowrap; padding:6px 0; }
.mk-nav a[aria-current="page"] { color:${C.ink}; font-weight:600; box-shadow:inset 0 -2px 0 ${C.ink}; }
.mk-right { margin-left:auto; display:flex; align-items:center; gap:20px; flex:none; }
.mk-signin { font:600 15px/1 ${F.body}; color:${C.ink}; white-space:nowrap; }
.mk-short { display:none; }
.mk-foot { margin-top:96px; box-shadow:inset 0 1px 0 ${C.line}; }
.mk-foot-row { padding-top:32px; padding-bottom:48px; display:flex; align-items:center; gap:28px; }
.mk-foot-brand { display:flex; align-items:center; gap:8px; margin-right:auto; color:${C.ink}; font:700 17px/1 ${F.display}; letter-spacing:-0.02em; }
.mk-foot-nav { display:flex; gap:28px; font:400 14px/1 ${F.body}; color:${C.ink2}; }
.mk-foot-nav a { color:inherit; }
@media (hover:hover) {
  .mk-nav a:not([aria-current="page"]):hover, .mk-foot-nav a:hover { color:${C.ink}; text-decoration:underline; text-underline-offset:4px; text-decoration-thickness:1px; }
  .mk-signin:hover { text-decoration:underline; text-underline-offset:4px; text-decoration-thickness:1px; }
}
@media (max-width: 1179px) {
  .mk-wrap { padding:0 32px; }
  .mk-head-row { gap:28px; }
  .mk-nav { gap:20px; }
}
.mk-head-row .mk-menu-btn { display:none; flex:none; }
.mk-menu { position:absolute; left:0; right:0; top:100%; background:#fff; border-bottom:1px solid ${C.line}; }
.mk-menu ul { list-style:none; margin:0; padding:8px 0 16px; }
.mk-menu a { display:block; padding:14px 0; font:500 16px/1.2 ${F.body}; color:${C.ink}; }
@media (max-width: 900px) {
  .mk-nav { display:none; }
  .mk-head-row .mk-menu-btn { display:inline-flex; margin-left:-4px; }
}
@media (min-width: 901px) {
  .mk-menu { display:none; }
}
/* Small phones: the logo alone carries the brand so the header row fits. */
@media (max-width: 379px) {
  .mk-brand-name { display:none; }
}
@media (max-width: 719px) {
  .mk-wrap { padding:0 16px; }
  .mk-head-row { height:60px; gap:12px; }
  .mk-brand { font-size:19px; gap:8px; }
  .mk-right { gap:14px; }
  .mk-long { display:none; }
  .mk-short { display:inline; }
  .mk-foot { margin-top:64px; }
  .mk-foot-row { flex-direction:column; align-items:flex-start; gap:20px; padding-top:32px; padding-bottom:40px; }
  .mk-foot-nav { flex-wrap:wrap; gap:14px 22px; }
}
`;

export function MarketingStyles() {
  return <style dangerouslySetInnerHTML={{ __html: MARKETING_CSS }} />;
}

/** Where the marketing links go for this visitor. */
export function useMarketingLinks() {
  const { state } = useSnapshot();
  const authed = Boolean(state.session.authed);
  // A signed-in account that hasn't finished onboarding gets sent there by
  // the route guard anyway, and onboarding would then preselect whatever
  // intent it saw last. The search and start buttons go there directly with
  // the intent the student just clicked.
  const onboarded = Boolean(state.onboarding && state.onboarding.completed);
  return {
    authed,
    opportunities: authed ? '/discover' : '/#search',
    search: !authed ? '/#search' : onboarded ? '/discover' : '/onboarding?intent=join&next=%2Fdiscover',
    projects: authed ? '/lead' : '/#student-projects',
    startProject: !authed ? '/signup?intent=start' : onboarded ? '/create' : '/onboarding?intent=start',
    signUp: '/signup',
  };
}

/* The landing search's What field (SearchBar generates its id). */
function searchInput() {
  return document.querySelector('#search input[type="search"]');
}

/* Smooth-scroll to an in-page anchor when it exists on this page; otherwise
   let the link navigate to the landing page, which scrolls to the hash. */
export function scrollToAnchor(e, href) {
  const hash = String(href || '').split('#')[1];
  if (!hash || typeof document === 'undefined') return;
  const el = document.getElementById(hash);
  if (!el) return;
  if (e && e.preventDefault) e.preventDefault();
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  if (hash === 'search') {
    const input = searchInput();
    if (input) setTimeout(() => input.focus({ preventScroll: true }), reduce ? 0 : 350);
  }
  if (window.history && window.history.replaceState) window.history.replaceState(null, '', `#${hash}`);
}

/* `next`: a same-site path the header's Sign in and Sign up should come back
   to (an invite link passes its own), so they don't drop the visitor's place.
   `signUpHref`: a fuller sign-up link to use instead (an invite adds the
   invitee's name). */
export function MarketingHeader({ active = '', next = '', signUpHref = '' }) {
  const router = useRouter();
  const pathname = usePathname();
  const links = useMarketingLinks();
  // Phones: the nav folds into a menu under the header.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtn = useRef(null);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      if (menuBtn.current) menuBtn.current.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const nav = [
    { key: 'opps', label: 'Opportunities', href: links.opportunities },
    { key: 'lead', label: 'Student projects', href: links.projects },
    { key: 'how', label: 'How it works', href: '/#how-it-works' },
    { key: 'schools', label: 'For schools', href: '/schools' },
  ];

  return (
    <header className="mk-head">
      <MarketingStyles />
      <div className="mk-wrap mk-head-row">
        <Link href="/" aria-label="VolunteerU home" className="mk-brand">
          <Logo size={30} title="" />
          <span className="mk-brand-name">VolunteerU</span>
        </Link>
        <nav aria-label="Primary" className="mk-nav">
          {nav.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              aria-current={active === l.key ? 'page' : undefined}
              onClick={l.href.includes('#') ? (e) => scrollToAnchor(e, l.href) : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mk-right">
          <Link href={links.authed ? '/app' : next ? `/signin?next=${encodeURIComponent(next)}` : '/signin'} className="mk-signin">
            {links.authed ? 'Open app' : 'Sign in'}
          </Link>
          {/* Phones show the short label; the name stays whole for screen readers. */}
          <Button
            variant="dark"
            size="sm"
            aria-label={links.authed ? 'Search opportunities' : 'Sign up free'}
            onClick={() => router.push(links.authed ? links.search : signUpHref || (next ? `/signup?next=${encodeURIComponent(next)}` : links.signUp))}
          >
            {links.authed ? (
              <>
                <span className="mk-long">Search opportunities</span>
                <span className="mk-short">Search</span>
              </>
            ) : (
              <>
                <span className="mk-long">Sign up free</span>
                <span className="mk-short">Sign up</span>
              </>
            )}
          </Button>
        </div>
        <IconButton
          ref={menuBtn}
          icon={menuOpen ? 'x' : 'menu'}
          label={menuOpen ? 'Close menu' : 'Open menu'}
          className="mk-menu-btn"
          size={40}
          iconSize={20}
          aria-expanded={menuOpen}
          aria-controls="mk-menu"
          onClick={() => setMenuOpen((v) => !v)}
        />
      </div>
      {menuOpen ? (
        <nav id="mk-menu" aria-label="Menu" className="mk-menu">
          <ul className="mk-wrap">
            {nav.map((l) => (
              <li key={l.key}>
                <Link
                  href={l.href}
                  aria-current={active === l.key ? 'page' : undefined}
                  onClick={(e) => {
                    setMenuOpen(false);
                    if (l.href.includes('#')) scrollToAnchor(e, l.href);
                  }}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

export function MarketingFooter() {
  const links = useMarketingLinks();
  const footer = [
    { label: 'Opportunities', href: links.opportunities },
    { label: 'Student projects', href: links.projects },
    { label: 'How it works', href: '/#how-it-works' },
    { label: 'For schools', href: '/schools' },
    { label: 'Safety', href: '/safety' },
    { label: 'Privacy', href: '/privacy' },
  ];
  return (
    <footer className="mk-foot">
      <div className="mk-wrap mk-foot-row">
        <Link href="/" aria-label="VolunteerU home" className="mk-foot-brand">
          <Logo size={22} title="" />
          <span>VolunteerU</span>
        </Link>
        <nav aria-label="Footer" className="mk-foot-nav">
          {footer.map((l) => (
            <Link key={l.label} href={l.href} onClick={l.href.includes('#') ? (e) => scrollToAnchor(e, l.href) : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <span style={S(`font:400 14px/1 ${F.body};color:${C.ink2}`)}>© 2026 VolunteerU, made in Indianapolis, Indiana</span>
      </div>
    </footer>
  );
}
