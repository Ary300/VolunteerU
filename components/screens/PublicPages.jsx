'use client';

/* ==========================================================================
   PublicPages.jsx, For schools, Safety, Privacy, and the 404 fallback
   Destinations for the footer and header links, built from the same
   marketing chrome as the landing page. Every claim here describes what the
   code does today; see README "Honesty".
   ========================================================================== */

import { useRouter, useSearchParams } from 'next/navigation';
import { S } from '../../lib/style.js';
import { C, F } from '../../lib/tokens.js';
import { PHOTOS } from '../../lib/photos.js';
import { Button } from '../ui.jsx';
import { MarketingHeader, MarketingFooter, useMarketingLinks, scrollToAnchor } from '../Marketing.jsx';

const PAGE_CSS = `
.mk-wrap.pp-main { padding-top:72px; }
.mk-wrap.pp-404-main { min-height:calc(100vh - 290px); }
.pp-h1 { margin:0; max-width:820px; font:700 56px/1.02 ${F.display}; letter-spacing:-0.035em; color:${C.ink}; text-wrap:balance; }
.pp-lede { margin:20px 0 0; max-width:600px; font:400 19px/1.5 ${F.body}; color:${C.ink2}; text-wrap:pretty; }
.pp-photo { margin-top:48px; height:400px; border-radius:16px; overflow:hidden; background:${C.mist}; }
.pp-photo img { width:100%; height:100%; object-fit:cover; display:block; }
.pp-rows { margin-top:64px; box-shadow:inset 0 1px 0 ${C.line}; }
.pp-row { display:grid; grid-template-columns:4fr 8fr; gap:72px; padding:32px 0; box-shadow:inset 0 -1px 0 ${C.line}; }
.pp-row h2 { margin:0; font:650 22px/1.2 ${F.display}; letter-spacing:-0.02em; color:${C.ink}; }
.pp-row div { max-width:640px; font:400 16px/1.6 ${F.body}; color:${C.ink2}; text-wrap:pretty; }
.pp-panel { margin-top:64px; display:flex; align-items:center; justify-content:space-between; gap:24px 48px; flex-wrap:wrap; }
.pp-panel h2 { margin:0; font:650 28px/1.12 ${F.display}; letter-spacing:-0.022em; color:${C.ink}; }
.pp-panel p { margin:8px 0 0; font:400 16px/1.5 ${F.body}; color:${C.ink2}; }
.pp-btns { display:flex; gap:12px; flex-wrap:wrap; }
.pp-404 { padding:120px 0 40px; max-width:640px; }
@media (max-width: 1179px) {
  .pp-row { grid-template-columns:1fr 2fr; gap:40px; }
  .pp-photo { height:320px; }
}
@media (max-width: 719px) {
  .mk-wrap.pp-main { padding-top:40px; }
  .mk-wrap.pp-404-main { min-height:calc(100vh - 380px); }
  .pp-h1 { font-size:38px; line-height:1.04; }
  .pp-lede { font-size:16px; margin-top:14px; }
  .pp-photo { margin-top:32px; height:220px; border-radius:16px; }
  .pp-rows { margin-top:40px; }
  .pp-row { grid-template-columns:1fr; gap:8px; padding:24px 0; }
  .pp-row h2 { font-size:19px; }
  .pp-row div { font-size:15px; }
  .pp-panel { margin-top:40px; }
  .pp-panel h2 { font-size:22px; }
  .pp-btns, .pp-btns > * { width:100%; }
  .pp-404 { padding:64px 0 24px; }
}
`;

function Shell({ active, title, lede, photo, photoPos, children }) {
  return (
    <div className="vu-screen" style={S(`width:100%;overflow-x:clip;background:${C.white}`)}>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <MarketingHeader active={active} />
      <main id="vu-main" tabIndex={-1} className="mk-wrap pp-main" style={S('outline:none')}>
        <h1 className="pp-h1">{title}</h1>
        {lede ? <p className="pp-lede">{lede}</p> : null}
        {photo ? (
          <div className="pp-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.src} alt="" style={{ objectPosition: photoPos || photo.pos }} />
          </div>
        ) : null}
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}

/** A heading on the left, its text on the right, a rule between rows. */
function Rows({ items }) {
  return (
    <div className="pp-rows">
      {items.map(([t, b]) => (
        <section key={t} className="pp-row">
          <h2>{t}</h2>
          <div>{b}</div>
        </section>
      ))}
    </div>
  );
}

/* ---- for schools ---------------------------------------------------------- */

export function Schools() {
  const router = useRouter();
  const params = useSearchParams();
  const links = useMarketingLinks();
  const forCounselors = params.get('for') === 'counselors';

  return (
    <Shell
      active="schools"
      title={forCounselors ? 'VolunteerU for counselors' : 'VolunteerU for schools'}
      lede={
        forCounselors
          ? 'Students log their hours in the app, and the organization that ran the shift confirms them. Each confirmed hour names who confirmed it and when.'
          : 'Students search volunteer opportunities and nonprofits near them, sign up, and log their hours. The organization that ran the shift confirms those hours in the app.'
      }
      // A sign-in sheet, since the page is about where hours come from. The
      // landing page and /signup already show the donation-drive shoot.
      photo={PHOTOS.outdoor}
      photoPos="center 45%"
    >
      <Rows
        items={[
          ['Hours with a source', 'Each confirmed hour names the organization that approved it. Hours a student logged alone are marked as logged on their own.'],
          ['A spreadsheet when you ask', 'Students can download their hours from Settings and send you the file. It lists the date, the organization and whether each entry was confirmed.'],
          ['Clubs can post too', 'A club adviser or a student can run a student project and approve the hours their volunteers log.'],
          ['What a counselor can see today', 'There’s no counselor dashboard yet. Ask a student to download their hours from Settings, or look through their profile with them. Confirmed hours show the organization and the date of each shift.'],
          ['Safety', 'Students have to be 13 or older to sign up. Organizations and student projects get a verified badge only after someone on our team reviews them by hand, and an owner can’t give their own listing the badge. The safety page lists what we check and what we don’t.'],
          ['Made in Carmel', 'A high school student in Carmel, Indiana built VolunteerU, and it’s free. It opens on Carmel and Hamilton County, and students anywhere in the US can search their own area.'],
          ['Getting started', 'Nothing to install. Students sign up with any email address. If your school wants to post its own opportunities, a staff member can sign up and post them as an organization.'],
        ]}
      />

      <section className="pp-panel" aria-labelledby="pp-try-h">
        <div style={S('min-width:0')}>
          <h2 id="pp-try-h">See what your students see</h2>
          <p>Search your area for opportunities and nonprofits. It works without an account.</p>
        </div>
        <div className="pp-btns">
          <Button variant="primary" icon="search" onClick={() => router.push(links.search)}>
            Search your area
          </Button>
          <Button variant="outline" onClick={() => router.push('/safety')}>
            Read the safety page
          </Button>
        </div>
      </section>
    </Shell>
  );
}

/* ---- safety --------------------------------------------------------------- */

export function Safety() {
  return (
    <Shell active="" title="Safety" lede="What VolunteerU checks, what it doesn’t, and what to do if a shift feels wrong.">
      <Rows
        items={[
          ['You have to be 13 or older', 'Signing up asks you to confirm your age. Accounts are for students 13 and up.'],
          ['Verified badges come from a person', 'Someone on the VolunteerU team reviews an organization and its staff contact before the badge appears. An owner can’t give their own listing the badge.'],
          ['Listings without the badge say so', 'An opportunity with no verified badge hasn’t been reviewed yet. Check who runs it before you go.'],
          ['Nobody confirms their own hours', 'Hours count as confirmed only when the organization approves them. A volunteer can’t accept their own application or approve their own hours.'],
          ['Your contact details stay private', 'Other students and organizations don’t see your address, phone number or guardian’s email. Applying shares your name and what you write in the application.'],
          ['What we don’t check', 'We don’t run background checks, and we don’t visit sites. A check-in records the code a volunteer types, and the organizer confirms who was there. Before a first shift, tell a parent or guardian where you’re going, and meet in a public place with other people around.'],
          ['If something goes wrong', 'Leave first. Then tell an adult you trust. If anyone is in danger, call 911. If you lead a student project, record what happened in your project’s Quality tab so your notes are in one place.'],
        ]}
      />
    </Shell>
  );
}

/* ---- privacy -------------------------------------------------------------- */

export function Privacy() {
  return (
    <Shell active="" title="Privacy" lede="Most people on VolunteerU are students under 18. Here’s what we keep, who sees it and how to turn it off.">
      <Rows
        items={[
          ['What we keep', 'Your name, email, school, grade, city, causes and availability, plus the hours you log and the hours organizations confirm. Applications keep the position you picked, your note and your answers. Messages between you and an organizer are stored so both of you can read them.'],
          ['Who sees it', 'An organization sees your name and your application when you apply to them. The volunteer directory is off until you turn it on in Settings, under Privacy. When it’s on, signed-in students and organizations can find your name, city, causes, short bio, grade and confirmed hours.'],
          ['What we don’t do', 'We don’t sell your data or show ads. Other students and organizations don’t see your address, phone number or guardian’s contact details.'],
          ['Analytics', 'We use PostHog to count page views and clicks so we can see what’s broken. Once you sign in, those events are linked to your account.'],
          ['Location', 'Allowing location is optional, and VolunteerU doesn’t store your coordinates. Searches use the city, state or ZIP you type.'],
          ['Your data', 'Some settings and project details are saved in your browser. In Settings, under Your data, you can download your hours as a spreadsheet, save a full backup, restore one, or clear everything on this device.'],
        ]}
      />
    </Shell>
  );
}

/* ---- 404 ------------------------------------------------------------------ */

export function NotFoundScreen() {
  const router = useRouter();
  const links = useMarketingLinks();
  const browse = (e) => {
    if (links.opportunities.includes('#')) {
      // On the landing page this scrolls to the search; elsewhere it navigates there.
      if (document.getElementById('search')) scrollToAnchor(e, links.opportunities);
      else router.push(links.opportunities);
      return;
    }
    router.push(links.opportunities);
  };
  return (
    <div className="vu-screen" style={S(`width:100%;overflow-x:clip;background:${C.white}`)}>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <MarketingHeader />
      <main id="vu-main" tabIndex={-1} className="mk-wrap pp-404-main" style={S('outline:none')}>
        <div className="pp-404">
          <p style={S(`margin:0 0 16px;font:600 15px/1 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>Error 404</p>
          <h1 className="pp-h1">Page not found</h1>
          <p className="pp-lede">The link may be old, or the listing may have closed.</p>
          <div className="pp-btns" style={S('margin-top:28px')}>
            <Button variant="primary" onClick={() => router.push('/')}>
              Back to home
            </Button>
            <Button variant="outline" icon="search" onClick={browse}>
              Search opportunities
            </Button>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
