'use client';

/* ==========================================================================
   HomeCharts.jsx, the "Your hours" section in Home's right rail. (The file
   once held two charts; it now renders one number and one stacked bar
   through HoursSummary, and the full history lives on the profile.)
   Every figure comes from state and splits the same way Profile does:
   - confirmed: org-confirmed project hours (stats.verifiedHours, synced from
     applications) plus any hoursLog entries marked verified
   - waiting: project hours an organizer hasn't confirmed yet. Sync stores
     those in stats.pendingVerification together with the self-logged hours,
     so the self-logged part is taken back out here.
   - logged on your own: hoursLog entries no organization will confirm
   projectsShown: Home is also showing the projects the student is in, each
   with its own hours list and Log hours button. The rail then leaves out its
   own Log hours button so Home has one place to log hours. A student with no
   project block keeps it. The rail total stays: it adds up every project and
   the self-logged hours, and it matches the profile.
   Under the summary come plain sentences: progress toward the hours goal from
   Settings when one is set, then the next badge.
   ========================================================================== */

import Link from 'next/link';
import { S } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import { useSnapshot } from '../lib/store.js';
import { Button } from './ui.jsx';
import { HoursSummary, fmtHours } from './vu/index.js';
import { openLogHours } from './LogHoursForm.jsx';
import { nextBadge } from '../lib/db.js';
import { plural } from '../lib/format.js';

const round1 = (n) => Math.round(Number(n || 0) * 10) / 10;
const hoursLabel = (n) => `${fmtHours(n)} ${plural(Number(fmtHours(n)), 'hour')}`;

export default function HomeCharts({ projectsShown = false } = {}) {
  const { state } = useSnapshot();
  const log = state.hoursLog || [];
  const sumHrs = (rows) => rows.reduce((t, h) => t + Number(h.hrs || 0), 0);
  // Same split as Profile. Confirmed comes only from organizer-written
  // assignments (synced into stats.verifiedHours). hoursLog is the volunteer's
  // own editable slice, so all of it counts as logged on your own, even an old
  // entry stored with verified: true.
  const ownLogged = round1(sumHrs(log));
  const confirmed = round1(Number(state.stats.verifiedHours || 0));
  // pendingVerification holds project hours waiting on an organizer plus the
  // unconfirmed self-logged hours, so take those back out.
  const waiting = round1(Math.max(0, Number(state.stats.pendingVerification || 0) - sumHrs(log.filter((h) => !h.verified))));
  const badge = nextBadge(confirmed);
  const badgeLeft = badge ? round1(badge.remaining) : 0;
  const nothingYet = confirmed === 0 && waiting === 0 && ownLogged === 0;
  const goal = Math.max(0, Math.round(Number((state.prefs && state.prefs.hoursGoal) || 0)));
  // The school's goal when the student set one (Settings > Interests).
  const goalLine = goal > 0
    ? confirmed >= goal
      ? `You've reached the ${hoursLabel(goal)} your school needs`
      : `${fmtHours(confirmed)} of the ${hoursLabel(goal)} your school needs`
    : null;
  // The next badge. At 0 confirmed a countdown ("25 hours to the 25-hour
  // badge") only repeats the badge size, so it names the threshold instead.
  const badgeLine = badge && badgeLeft > 0 && !nothingYet
    ? confirmed > 0
      ? `${hoursLabel(badgeLeft)} to the ${badge.need}-hour badge`
      : `First badge at ${badge.need} confirmed hours`
    : null;
  const lines = [goalLine, badgeLine].filter(Boolean);

  return (
    <section aria-labelledby="home-hours-h" className="vu-rail-sec">
      <div className="vu-sec-head">
        <h2 id="home-hours-h" style={S(`margin:0;font:600 17px/1.2 ${F.display};letter-spacing:-0.01em;color:${C.ink}`)}>Your hours</h2>
        <Link href="/profile" className="vu-link-ul" style={S(`flex:none;font:600 14px/1.2 ${F.body}`)}>
          Profile
        </Link>
      </div>

      <div style={S('margin-top:12px')}>
        <HoursSummary
          size="sm"
          confirmed={confirmed}
          waiting={waiting}
          own={ownLogged}
          labels={{ waiting: 'waiting on an organizer' }}
          action={!projectsShown || lines.length ? (
            <>
            {nothingYet && !projectsShown ? (
              <p style={S(`margin:-4px 0 12px;font:400 13px/1.45 ${F.body};color:${C.ink2}`)}>Log hours you've already done, or sign up for a shift.</p>
            ) : null}
            {projectsShown ? null : <Button size="sm" icon="plus" onClick={() => openLogHours()}>Log hours</Button>}
            {/* Goal or next badge as a plain sentence (CARDS.md section 5): no
                link, no button, no progress bar. Badges live on Profile. */}
            {lines.map((line, i) => (
              <p key={line} style={S(`margin:${projectsShown && i === 0 ? '0' : i ? '4px 0 0' : '14px 0 0'};font:400 13px/1.45 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>
                {line}
              </p>
            ))}
            </>
          ) : null}
        />
      </div>
    </section>
  );
}
