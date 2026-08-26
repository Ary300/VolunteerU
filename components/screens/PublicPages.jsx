'use client';

/* ==========================================================================
   PublicPages.jsx, For schools, Safety, Privacy, and the 404 fallback
   Destinations for the design's footer and header links, built from the same
   marketing chrome the landing page uses.
   ========================================================================== */

import { useRouter, useSearchParams } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable } from '../ui.jsx';
import { MarketingHeader, MarketingFooter } from '../Marketing.jsx';

const MONO = "'Geist Mono',monospace";

function Shell({ active, kicker, title, lede, children }) {
  return (
    <div className="vu-screen vu-fixed-width" style={S('width:100%;min-width:1180px;overflow:hidden;padding-bottom:56px')}>
      <MarketingHeader active={active} />
      <div id="vu-main" className="vu-pad-32" style={S('max-width:1180px;margin:0 auto;padding:88px 32px 0')}>
        <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#C2603C`)}>{kicker}</div>
        <h1 className="vu-h2-big" style={S('margin:16px 0 0;font:600 56px/1 Geist;letter-spacing:-0.05em;max-width:760px;text-wrap:balance')}>{title}</h1>
        <p style={S('margin:22px 0 0;max-width:560px;font:400 18px/1.6 Geist;color:#57504A;text-wrap:pretty')}>{lede}</p>
        {children}
      </div>
      <MarketingFooter />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={S('margin-top:56px')}>
      <h2 className="vu-h2" style={S('margin:0;font:600 30px/1.08 Geist;letter-spacing:-0.04em')}>{title}</h2>
      <div style={S('margin-top:16px;max-width:720px;font:400 16px/1.7 Geist;color:#57504A;text-wrap:pretty')}>{children}</div>
    </div>
  );
}

function Cards({ items }) {
  return (
    <div className="vu-3col" style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:40px')}>
      {items.map((c) => (
        <div key={c.t} style={S('padding:28px;border-radius:16px;background:#FCFAF8;border:1px solid #F1EBE4')}>
          <div style={S(`font:500 11px/1 ${MONO};color:#C2603C`)}>{c.k}</div>
          <div style={S('margin-top:20px;font:600 22px/1.12 Geist;letter-spacing:-0.032em')}>{c.t}</div>
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
  const forCounselors = params.get('for') === 'counselors';

  return (
    <Shell
      active="schools"
      kicker={forCounselors ? 'For counselors' : 'For schools'}
      title={forCounselors ? 'Confirm a service record without chasing signatures' : 'Service hours your school can actually verify'}
      lede={
        forCounselors
          ? 'Every hour on a student record was geofenced at the site and confirmed by the organizer who ran the session. You get one link, not a folder of paper slips.'
          : 'Students find real, age-eligible openings near school. You get a record you can check, an audit trail behind every hour, and no clipboard.'
      }
    >
      <Cards
        items={[
          { k: '01', t: 'One link per student', b: 'Hours, causes, punctuality and organizer notes on a single page you can open any time. No login required to view.' },
          { k: '02', t: 'Verification you can audit', b: 'Check-in and check-out come from the site geofence. Manual edits are logged with a reason and marked as edited.' },
          { k: '03', t: 'Vetted organizations only', b: 'Registration, insurance and a named staff contact are confirmed before a listing is shown to a student.' },
        ]}
      />

      <Section title="What a counselor sees">
        A student grants access from their profile. You see the same record an organization sees when they apply: every event, the hours, whether the
        student was on time, the score the organizer gave, and the note behind it. You cannot edit any of it, which is the point.
      </Section>

      <Section title="Safeguarding">
        Age minimums, guardian consent and the two-adult rule are enforced before a listing is ever shown. Student-run projects operate under a verified
        sponsor that supplies the site, the insurance and the supervising adult.
      </Section>

      <Section title="Getting a school set up">
        Nothing to install. Students sign up with a school email and pick their school; a counselor requests access from the student's record page. If you
        want a roster-level view across a grade, that is the part we set up with you directly.
      </Section>

      <div style={S('margin-top:48px;padding:34px;border-radius:18px;border:1px solid #EFE3DC;background:#FAF6F3;max-width:720px')}>
        <div style={S('font:600 22px/1.15 Geist;letter-spacing:-0.03em')}>Talk to us about your school</div>
        <div style={S('margin-top:10px;font:450 15px/1.6 Geist;color:#6B635C')}>
          Tell us the grade sizes and the hour requirement and we will show you what the counselor view looks like with your numbers.
        </div>
        <div style={S('margin-top:20px;display:flex;gap:12px;flex-wrap:wrap')}>
          <Pressable
            label="Create a student profile"
            onClick={() => router.push('/onboarding')}
            className={cx(H.primaryLift, H.press)}
            style={S('display:inline-flex;align-items:center;gap:9px;padding:0 22px;height:46px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 10px 20px -8px rgba(150,60,30,.55)')}
          >
            <span aria-hidden="true" style={S('font-size:12px;opacity:.9')}>▷</span>
            Create a profile
          </Pressable>
          <Pressable
            label="Read the safety policy"
            onClick={() => router.push('/safety')}
            className={cx(H.secondaryLift, H.press)}
            style={S('display:inline-flex;align-items:center;padding:0 20px;height:46px;border-radius:12px;border:1px solid #E7C0AC;background:#fff;font:600 15px/1 Geist;color:#C2603C;cursor:pointer')}
          >
            Safety policy
          </Pressable>
        </div>
      </div>
      <div style={S('height:40px')} />
    </Shell>
  );
}

/* ---- safety --------------------------------------------------------------- */

export function Safety() {
  const rules = [
    ['Vetted organizations only', 'Registration, current insurance and a named staff contact are confirmed before a listing goes live, and re-checked every term.'],
    ['A background-checked adult on every shift', 'Each listing names the staff lead who is on site. Student-run projects operate under a sponsor who supplies that adult.'],
    ['Never a solo shift', 'Group shifts are flagged, and no listing places a student alone with one adult.'],
    ['Age minimums enforced before you see it', 'A listing you are too young for is filtered out rather than shown and refused.'],
    ['Guardian consent under 16', 'Collected once per organization, before a student can be accepted onto a session.'],
    ['Incidents go to the sponsor the same day', 'Anything involving injury or a guardian is logged on the project record and sent to the sponsoring organization.'],
  ];
  return (
    <Shell
      active=""
      kicker="Safety"
      title="What we check before a student ever sees a listing"
      lede="Volunteering should not be the risky part of a student's week. These rules are enforced by the product, not by a policy page."
    >
      <div style={S('margin-top:48px;border-radius:18px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;max-width:860px;margin:0 auto')}>
        {rules.map(([t, b]) => (
          <div key={t} style={S('padding:22px 24px;border-bottom:1px solid #F1EBE4;display:flex;gap:14px;align-items:flex-start')}>
            <span aria-hidden="true" style={S('color:#3F6B4E;margin-top:3px')}>✓</span>
            <div>
              <div style={S('font:600 16px/1.3 Geist;letter-spacing:-0.02em')}>{t}</div>
              <div style={S('margin-top:7px;font:450 14px/1.6 Geist;color:#6B635C')}>{b}</div>
            </div>
          </div>
        ))}
      </div>

      <Section title="If something goes wrong">
        Leave the situation and tell the staff lead first. Then file it from the project page, incidents are logged on the project record with a timestamp
        and sent to the sponsoring organization the same day. If you are a project lead, the incident form is in the Quality tab.
      </Section>

      <Section title="Reporting a listing">
        Anything that looks wrong, an organization that cannot produce a staff contact, a shift that would leave you alone, a listing aimed at students
        below its own age minimum, should be reported from the listing. Listings are pulled while we check.
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
      kicker="Privacy"
      title="What we collect, and what we never do with it"
      lede="You are mostly students under 18. That shapes every decision here."
    >
      <Section title="What is on your record">
        Your name, school, grade, causes, availability and the hours you have earned. Each hour carries the organization, the date, the check-in and
        check-out times and the organizer's score. That is the record organizations and counselors see when you let them.
      </Section>

      <Section title="What we never do">
        We do not sell your data. We do not show your address, phone number or guardian's contact details to other students or to organizations. We do not
        put personal information in a URL, and we do not track you across other sites.
      </Section>

      <Section title="Location">
        Location permission is optional and only ever used to rank openings by travel time. Coordinates are not stored. Decline it and matching falls back
        to your ZIP code, which is the default.
      </Section>

      <Section title="Who can see your record">
        Nobody, until you share it. Applying to an organization shares your verified hours and cause history with that organization only, and you can turn
        that off per application. A counselor sees your record only after you grant access, and can never edit it.
      </Section>

      <Section title="Your data on this device">
        This build stores everything in your browser's local storage. Settings → Your data lets you export a full backup, restore one, or delete everything
        permanently.
      </Section>
      <div style={S('height:64px')} />
    </Shell>
  );
}

/* ---- 404 ------------------------------------------------------------------ */

export function NotFoundScreen() {
  const router = useRouter();
  return (
    <div className="vu-screen vu-fixed-width" style={S('width:100%;min-width:1180px;overflow:hidden')}>
      <MarketingHeader />
      <div id="vu-main" className="vu-pad-32" style={S('max-width:1180px;margin:0 auto;padding:120px 32px 160px;text-align:center')}>
        <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>404</div>
        <h1 className="vu-h2-big" style={S('margin:16px auto 0;max-width:640px;font:600 56px/1.02 Geist;letter-spacing:-0.05em')}>
          That page is not here
        </h1>
        <p style={S('margin:18px auto 0;max-width:480px;font:400 17px/1.6 Geist;color:#57504A')}>
          The link may be old, or the listing may have closed. Everything still open is one click away.
        </p>
        <div style={S('display:flex;gap:12px;justify-content:center;margin-top:30px;flex-wrap:wrap')}>
          <Pressable
            label="Go to the home page"
            onClick={() => router.push('/')}
            className={cx(H.primaryLift, H.press)}
            style={S('display:inline-flex;align-items:center;gap:9px;padding:0 26px;height:46px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 10px 20px -8px rgba(150,60,30,.55)')}
          >
            <span aria-hidden="true" style={S('font-size:12px;opacity:.9')}>▷</span>
            Back to home
          </Pressable>
          <Pressable
            label="Browse openings"
            onClick={() => router.push('/discover')}
            className={cx(H.secondaryLift, H.press)}
            style={S('display:inline-flex;align-items:center;padding:0 22px;height:46px;border-radius:12px;border:1px solid #E7C0AC;background:#fff;font:600 15px/1 Geist;color:#C2603C;cursor:pointer')}
          >
            Browse openings
          </Pressable>
        </div>
      </div>
      <MarketingFooter />
    </div>
  );
}
