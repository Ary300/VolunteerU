'use client';

/* ==========================================================================
   RouteSkeletons.jsx, what a heavy route shows while its page is on the way
   (rendered by the routes' loading.js files).

   Each one mirrors the final page's layout in flat mist blocks (.vu-ld,
   globals.css "MOTION AND FEEDBACK"): same chrome, same columns, same
   heights, so nothing jumps when the real page lands. No shimmer, no
   moving sheen: a still placeholder reads as calmer and costs nothing.
   ========================================================================== */

import Link from 'next/link';
import { S } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import { useSnapshot } from '../lib/store.js';
import AppFrame from './AppFrame.jsx';
import { MarketingHeader } from './Marketing.jsx';
import { Wordmark } from './Logo.jsx';

/** One mist block. `w`/`h` are CSS lengths; `kind` picks the radius. */
function B({ w = '100%', h = 14, kind = '', style = '', className = '' }) {
  const cls = ['vu-ld', kind ? `vu-ld-${kind}` : '', className].filter(Boolean).join(' ');
  return <div className={cls} style={S(`width:${w};height:${typeof h === 'number' ? `${h}px` : h};flex:none;${style}`)} />;
}

function Busy({ label, children, className = 'vu-page', style = '' }) {
  return (
    <div className={className} aria-busy="true" aria-label={label} style={S(style)}>
      {children}
    </div>
  );
}

/* A compact listing row: 56px thumb and three text lines (Discover's list). */
function ListRow() {
  return (
    <div style={S('display:flex;gap:14px;align-items:flex-start')}>
      <B w="56px" h={56} style="border-radius:10px" />
      <div style={S('flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;padding-top:2px')}>
        <B w="78%" h={15} />
        <B w="62%" h={12} />
        <B w="44%" h={12} />
      </div>
    </div>
  );
}

/* ---- /discover ------------------------------------------------------------ */
export function DiscoverSkeleton() {
  return (
    <AppFrame loading>
      <Busy label="Loading Discover" className="vu-page dz-page">
        <div className="dz-head" style={S('justify-content:space-between')}>
          <B w="190px" h={38} className="vu-ld-hide-m" />
          <div className="dz-head-act">
            <B w="120px" h={16} />
            <B w="200px" h={36} kind="pill" style="border-radius:10px" />
          </div>
        </div>
        <div style={S('margin-top:24px;display:flex;gap:12px;align-items:center')}>
          <B w="100%" h="var(--vu-ld-sb-h, 66px)" kind="pill" style="flex:1" />
          <B w="116px" h={64} kind="pill" className="vu-ld-hide-m" />
        </div>
        <div style={S(`margin-top:20px;display:flex;gap:36px;overflow:hidden;padding-bottom:14px;border-bottom:1px solid ${C.line}`)}>
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} style={S('display:flex;flex-direction:column;align-items:center;gap:8px;flex:none')}>
              <B w="24px" h={24} kind="circle" />
              <B w={`${48 + ((i * 17) % 40)}px`} h={11} />
            </div>
          ))}
        </div>
        <div className="vu-ld-split">
          <div style={S('min-width:0')}>
            <B w="280px" h={46} kind="pill" style="max-width:100%" />
            <div style={S('margin-top:16px;display:flex;gap:8px;overflow:hidden')}>
              {[96, 120, 132, 84, 76].map((w, i) => <B key={i} w={`${w}px`} h={34} kind="pill" />)}
            </div>
            <div className="vu-ld-rows2" style={S('margin-top:22px')}>
              {Array.from({ length: 6 }, (_, i) => <ListRow key={i} />)}
            </div>
          </div>
          <B h="calc(100vh - 300px)" kind="photo" className="vu-ld-map" style="min-height:420px" />
        </div>
      </Busy>
    </AppFrame>
  );
}

/* ---- /profile ------------------------------------------------------------- */
export function ProfileSkeleton() {
  return (
    <AppFrame loading>
      <Busy label="Loading your profile">
        <div style={S('display:flex;align-items:center;gap:24px')}>
          <B w="96px" h={96} kind="circle" />
          <div style={S('display:flex;flex-direction:column;gap:10px;flex:1;min-width:0')}>
            <B w="min(320px, 80%)" h={40} />
            <B w="min(260px, 70%)" h={14} />
            <B w="88px" h={14} />
          </div>
        </div>
        <div className="vu-ld-rail" style={S('margin-top:36px')}>
          <div style={S('min-width:0')}>
            <div style={S('display:flex;justify-content:space-between;align-items:center')}>
              <B w="140px" h={26} />
              <B w="116px" h={36} style="border-radius:10px" />
            </div>
            <B w="220px" h={20} style="margin-top:28px" />
            <B w="100px" h={26} style="margin-top:56px" />
            <div style={S(`margin-top:16px;border-top:1px solid ${C.line};padding-top:18px;display:flex;flex-direction:column;gap:10px`)}>
              <B w="120px" h={15} />
              <B w="min(420px, 90%)" h={13} />
            </div>
            <B w="200px" h={24} style="margin-top:56px" />
            <B w="min(360px, 85%)" h={13} style="margin-top:12px" />
          </div>
          <div style={S('min-width:0')}>
            <B w="100px" h={22} />
            <div style={S(`margin-top:16px;border-top:1px solid ${C.line};padding-top:16px;display:flex;flex-direction:column;gap:8px`)}>
              <B w="110px" h={15} />
              <B w="60px" h={12} />
            </div>
            <B w="160px" h={22} style="margin-top:44px" />
            <B w="100%" h={13} style="margin-top:14px" />
            <B w="80%" h={13} style="margin-top:8px" />
            <B w="150px" h={36} style="margin-top:16px;border-radius:10px" />
          </div>
        </div>
      </Busy>
    </AppFrame>
  );
}

/* ---- /lead and /lead/<project>/<tab> ---------------------------------------- */
export function LeadSkeleton() {
  return (
    <AppFrame loading>
      <Busy label="Loading your project">
        <div className="vu-ld-leadhead">
          <B w="88px" h={88} kind="photo" />
          <div style={S('flex:1;min-width:0;display:flex;flex-direction:column;gap:10px')}>
            <B w="min(420px, 90%)" h={36} />
            <B w="min(480px, 95%)" h={14} />
            <B w="min(240px, 70%)" h={14} />
          </div>
          <div className="vu-ld-hide-m" style={S('display:flex;gap:10px')}>
            <B w="132px" h={36} style="border-radius:10px" />
            <B w="140px" h={36} style="border-radius:10px" />
          </div>
        </div>
        <div style={S(`margin-top:32px;display:flex;gap:28px;overflow:hidden;padding-bottom:14px;border-bottom:1px solid ${C.line}`)}>
          {[72, 54, 70, 50, 88, 96, 60, 58, 92, 76, 64].map((w, i) => <B key={i} w={`${w}px`} h={15} />)}
        </div>
        <div className="vu-ld-rail" style={S('margin-top:36px')}>
          <div style={S('min-width:0')}>
            <B w="220px" h={24} />
            <div style={S(`margin-top:16px;border-top:1px solid ${C.line}`)}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={S(`display:flex;gap:16px;align-items:center;padding:16px 0;border-bottom:1px solid ${C.line}`)}>
                  <B w="36px" h={36} kind="circle" />
                  <div style={S('flex:1;display:flex;flex-direction:column;gap:8px')}>
                    <B w="140px" h={15} />
                    <B w="200px" h={12} />
                  </div>
                  <B w="76px" h={36} style="border-radius:10px" className="vu-ld-hide-m" />
                </div>
              ))}
            </div>
          </div>
          <div style={S('min-width:0;display:flex;flex-direction:column;gap:14px')}>
            <B w="150px" h={22} />
            {[0, 1, 2].map((i) => (
              <div key={i} style={S(`padding:12px 0;border-bottom:1px solid ${C.line};display:flex;flex-direction:column;gap:8px`)}>
                <B w="70%" h={15} />
                <B w="85%" h={12} />
              </div>
            ))}
          </div>
        </div>
      </Busy>
    </AppFrame>
  );
}

/* ---- /join/<id> ------------------------------------------------------------
   The listing page has its own chrome: the public header when signed out, a
   slim bar back to Discover when signed in (JoinListing's Shell). */
function JoinChrome({ children }) {
  const { state } = useSnapshot();
  const authed = !!(state && state.session && state.session.authed);
  return (
    <div className="vu-jl-page" style={S('min-height:100vh;background:#fff')}>
      {authed ? (
        <div style={S(`border-bottom:1px solid ${C.line}`)}>
          <div className="vu-jl-wrap" style={S('height:72px;display:flex;align-items:center;justify-content:space-between;gap:16px')}>
            <Link href="/" aria-label="VolunteerU home" style={S('display:inline-flex;text-decoration:none')}>
              <Wordmark size={30} />
            </Link>
            <Link href="/discover" className="vu-link-ul" style={S(`font:600 14px/1 ${F.body}`)}>Discover</Link>
          </div>
        </div>
      ) : (
        <MarketingHeader />
      )}
      <main className="vu-jl-wrap" style={S('padding-top:32px;padding-bottom:96px')} aria-busy="true" aria-label="Loading this listing">
        {children}
      </main>
    </div>
  );
}

/* Sized like the signed-out page, the one a shared link usually opens: the
   title block (two lines on phones), the organization line and the address,
   then the about text with the panel after it and the action bar pinned
   below on phones (.vu-jl-grid.has-bar), so the panel doesn't trade places
   with the text when the page's own styles arrive. */
export function JoinSkeleton() {
  return (
    <JoinChrome>
      <B w="min(560px, 92%)" h="var(--vu-ld-jl-title, 42px)" />
      <B w="min(240px, 60%)" h={15} style="margin-top:16px" />
      <B w="min(280px, 70%)" h={15} style="margin-top:11px" />
      <div className="vu-jl-hero vu-ld" style={S('margin-top:24px;background:var(--mist)')} />
      <div className="vu-jl-grid has-bar">
        <div className="vu-jl-main" style={S('display:flex;flex-direction:column;gap:12px')}>
          <B w="92%" h={18} />
          <B w="80%" h={14} />
          <B w="60%" h={13} />
          <B w="180px" h={24} style="margin-top:36px" />
          <B w="100%" h={14} />
          <B w="86%" h={14} />
        </div>
        <div className="vu-jl-panel" style={S('display:flex;flex-direction:column;gap:12px;position:static')}>
          <B w="70%" h={22} />
          <B w="100%" h={13} />
          <B w="80%" h={13} />
          <B w="100%" h={52} style="margin-top:12px;border-radius:10px" />
        </div>
      </div>
      <div className="vu-jl-bar" aria-hidden="true">
        <span className="vu-jl-bar-meta" style={S('flex:1;display:flex;flex-direction:column;gap:6px')}>
          <B w="60%" h={15} />
          <B w="40%" h={12} />
        </span>
        <B w="132px" h={44} style="border-radius:10px" />
      </div>
    </JoinChrome>
  );
}
