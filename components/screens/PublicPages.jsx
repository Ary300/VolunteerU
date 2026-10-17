'use client';

/* ==========================================================================
   PublicPages.jsx, For schools, Safety, Privacy, and the 404 fallback
   Destinations for the design's footer and header links, built from the same
   marketing chrome the landing page uses. Every claim here describes what the
   code does today; see README "Honesty".
   ========================================================================== */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { S, cx, H } from '../../lib/style.js';
import { Icon } from '../ui.jsx';
import { MarketingHeader, MarketingFooter, useMarketingLinks, scrollToAnchor } from '../Marketing.jsx';

const MONO = "'Geist Mono',monospace";

const PAGE_CSS = `
@media (max-width: 720px) {
  .pp-main { padding:48px 16px 0 !important; }
  .pp-h1 { font-size:38px !important; }
  .pp-h2 { font-size:26px !important; }
  .pp-cards { grid-template-columns:1fr !important; }
  .pp-box { padding:24px 20px !important; }
}
@media (min-width: 721px) and (max-width: 1000px) {
  .pp-cards { grid-template-columns:1fr !important; }
}
`;

const btn = 'display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;padding:0 22px;height:46px;border-radius:12px;font:600 15px/1 Geist;cursor:pointer;text-decoration:none';

function Shell({ active, title, lede, children }) {
  return (
    <div className="vu-screen" style={S('width:100%;overflow-x:clip;padding-bottom:56px')}>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <MarketingHeader active={active} />
      <main id="vu-main" className="pp-main" style={S('max-width:1180px;margin:0 auto;padding:88px 32px 0')}>
        <h1 className="vu-h2-big pp-h1" style={S('margin:0;font:600 56px/1.02 Geist;letter-spacing:-0.05em;max-width:760px;text-wrap:balance')}>{title}</h1>
        {lede ? <p style={S('margin:22px 0 0;max-width:580px;font:400 18px/1.6 Geist;color:#57504A;text-wrap:pretty')}>{lede}</p> : null}
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={S('margin-top:56px')}>
      <h2 className="vu-h2 pp-h2" style={S('margin:0;font:600 30px/1.08 Geist;letter-spacing:-0.04em')}>{title}</h2>
      <div style={S('margin-top:16px;max-width:720px;font:400 16px/1.7 Geist;color:#57504A;text-wrap:pretty')}>{children}</div>
    </section>
  );
}

function Cards({ items }) {
  return (
    <div className="pp-cards" style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:40px')}>
      {items.map((c, i) => (
        <div key={c.t} style={S('padding:28px;border-radius:16px;background:#FCFAF8;border:1px solid #F1EBE4')}>
          <div style={S(`font:500 13px/1 ${MONO};color:#A8482A`)}>{i + 1}</div>
          <h3 style={S('margin:18px 0 0;font:600 22px/1.12 Geist;letter-spacing:-0.032em')}>{c.t}</h3>
          <div style={S('margin-top:11px;font:450 15px/1.55 Geist;color:#6B635C;text-wrap:pretty')}>{c.b}</div>
        </div>
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
    >
      <Cards
        items={[
          { t: 'Hours with a source', b: 'Each confirmed hour names the organization that approved it. Hours a student logged alone are marked as logged on their own.' },
          { t: 'A spreadsheet when you ask', b: 'Students can download their hours from Settings and send you the file. It lists the date, the organization and whether each entry was confirmed.' },
          { t: 'Clubs can post too', b: 'A club adviser or a student can run a student project and approve the hours their volunteers log.' },
        ]}
      />

      <Section title="What a counselor can see today">
        There’s no counselor dashboard yet. Ask a student to download their hours from Settings, or look through their profile with them. Confirmed hours show the
        organization and the date of each shift.
      </Section>

      <Section title="Safety">
        Students have to be 13 or older to sign up. Organizations and student projects get a verified badge only after someone on our team reviews them by hand,
        and an owner can’t give their own listing the badge. The safety page lists what we check and what we don’t.
      </Section>

      <Section title="Getting started">
        Nothing to install. Students sign up with any email address. If your school wants to post its own opportunities, a staff member can sign up and post
        them as an organization.
      </Section>

      <div className="pp-box" style={S('margin-top:48px;padding:34px;border-radius:18px;border:1px solid #EFE3DC;background:#FAF6F3;max-width:720px')}>
        <h2 style={S('margin:0;font:600 22px/1.15 Geist;letter-spacing:-0.03em')}>See what your students see</h2>
        <div style={S('margin-top:10px;font:450 15px/1.6 Geist;color:#57504A')}>
          Search your area for opportunities and nonprofits. It works without an account.
        </div>
        <div style={S('margin-top:20px;display:flex;gap:12px;flex-wrap:wrap')}>
          <button
            type="button"
            onClick={() => router.push(links.authed ? '/discover' : '/#search')}
            className={cx('lp-btn', H.press)}
            style={S(btn)}
          >
            <Icon name="search" size={16} stroke={2} />
            Search your area
          </button>
          <button
            type="button"
            onClick={() => router.push('/safety')}
            className={cx('lp-btn-ghost', H.press)}
            style={S(btn)}
          >
            Read the safety page
          </button>
        </div>
      </div>
      <div style={S('height:40px')} />
    </Shell>
  );
}

/* ---- safety --------------------------------------------------------------- */

export function Safety() {
  const rules = [
    ['You have to be 13 or older', 'Signing up asks you to confirm your age. Accounts are for students 13 and up.'],
    ['Verified badges come from a person', 'Someone on the VolunteerU team reviews an organization and its staff contact before the badge appears. An owner can’t give their own listing the badge.'],
    ['Listings without the badge say so', 'An opportunity with no verified badge hasn’t been reviewed yet. Check who runs it before you go.'],
    ['Nobody confirms their own hours', 'Hours count as confirmed only when the organization approves them. A volunteer can’t accept their own application or approve their own hours.'],
    ['Your contact details stay private', 'Other students and organizations don’t see your address, phone number or guardian’s email. Applying shares your name and what you write in the application.'],
  ];
  return (
    <Shell
      active=""
      title="Safety"
      lede="What VolunteerU checks and what to do if a shift feels wrong."
    >
      <ul style={S('margin:48px 0 0;padding:0;list-style:none;border-radius:18px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;max-width:860px')}>
        {rules.map(([t, b]) => (
          <li key={t} style={S('padding:22px 24px;border-bottom:1px solid #F1EBE4;display:flex;gap:14px;align-items:flex-start')}>
            <span style={S('color:#3F6B4E;margin-top:2px')}>
              <Icon name="check-circle" size={18} />
            </span>
            <div>
              <h2 style={S('margin:0;font:600 16px/1.3 Geist;letter-spacing:-0.02em')}>{t}</h2>
              <div style={S('margin-top:7px;font:450 14px/1.6 Geist;color:#57504A')}>{b}</div>
            </div>
          </li>
        ))}
      </ul>

      <Section title="What we don’t check">
        We don’t run background checks, and we don’t visit sites. A check-in records the code a volunteer types, and the organizer confirms who was there. Before
        a first shift, tell a parent or guardian where you’re going, and meet in a public place with other people around.
      </Section>

      <Section title="If something goes wrong">
        Leave, and tell an adult you trust. If anyone is in danger, call 911. If you lead a student project, record what happened in your project’s Quality tab
        so your notes are in one place.
      </Section>
      <div style={S('height:64px')} />
    </Shell>
  );
}

/* ---- privacy -------------------------------------------------------------- */

export function Privacy() {
  return (
    <Shell
      active=""
      title="Privacy"
      lede="Most people on VolunteerU are students under 18. Here’s what we keep, who sees it and how to turn it off."
    >
      <Section title="What we keep">
        Your name, email, school, grade, city, causes and availability, plus the hours you log and the hours organizations confirm. Applications keep the position
        you picked, your note and your answers. Messages between you and an organizer are stored so both of you can read them.
      </Section>

      <Section title="Who sees it">
        An organization sees your name and your application when you apply to them. Signed-in students and organizations can find you in the volunteer directory,
        which shows your name, city, causes, short bio, grade and confirmed hours. Turn that off in Settings, under Privacy.
      </Section>

      <Section title="What we don’t do">
        We don’t sell your data or show ads. Other students and organizations don’t see your address, phone number or guardian’s contact details.
      </Section>

      <Section title="Analytics">
        We use PostHog to count page views and clicks so we can see what’s broken. Once you sign in, those events are linked to your account.
      </Section>

      <Section title="Location">
        Allowing location is optional, and VolunteerU doesn’t store your coordinates. Searches use the city, state or ZIP you type.
      </Section>

      <Section title="Your data">
        Some settings and project details are saved in your browser. In Settings, under Your data, you can download your hours as a spreadsheet, save a full
        backup, restore one, or clear everything on this device.
      </Section>
      <div style={S('height:64px')} />
    </Shell>
  );
}

/* ---- 404 ------------------------------------------------------------------ */

export function NotFoundScreen() {
  const router = useRouter();
  const links = useMarketingLinks();
  return (
    <div className="vu-screen" style={S('width:100%;overflow-x:clip')}>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <MarketingHeader />
      <main id="vu-main" className="pp-main" style={S('max-width:1180px;margin:0 auto;padding:120px 32px 160px;text-align:center')}>
        <div style={S(`font:500 13px/1 ${MONO};color:#8A8179`)}>404</div>
        <h1 className="vu-h2-big pp-h1" style={S('margin:16px auto 0;max-width:640px;font:600 56px/1.02 Geist;letter-spacing:-0.05em')}>
          Page not found
        </h1>
        <p style={S('margin:18px auto 0;max-width:480px;font:400 17px/1.6 Geist;color:#57504A')}>
          The link may be old, or the listing may have closed.
        </p>
        <div style={S('display:flex;gap:12px;justify-content:center;margin-top:30px;flex-wrap:wrap')}>
          <button type="button" onClick={() => router.push('/')} className={cx('lp-btn', H.press)} style={S(btn)}>
            Back to home
          </button>
          <Link
            href={links.opportunities}
            onClick={links.opportunities.includes('#') ? (e) => scrollToAnchor(e, links.opportunities) : undefined}
            className={cx('lp-btn-ghost', H.press)}
            style={S(btn)}
          >
            Search opportunities
          </Link>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
