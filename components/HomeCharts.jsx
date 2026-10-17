'use client';

/* ==========================================================================
   HomeCharts.jsx, the small "Your hours" summary in Home's side column.
   (It used to hold two charts; Home now leads with search, so hours are a
   short summary here and the full history lives on the Card tab.)
   Every figure comes from state and splits the same way Profile does:
   - confirmed: org-confirmed project hours (stats.verifiedHours, synced from
     applications) plus any hoursLog entries marked verified
   - waiting: project hours an organizer hasn't confirmed yet. Sync stores
     those in stats.pendingVerification together with the self-logged hours,
     so the self-logged part is taken back out here.
   - logged on your own: hoursLog entries no organization will confirm
   ========================================================================== */

import Link from 'next/link';
import { S, cx, H } from '../lib/style.js';
import { useSnapshot } from '../lib/store.js';
import { Icon, Pressable } from './ui.jsx';
import { openLogHours } from './LogHoursForm.jsx';
import { effectiveStreak, nextBadge } from '../lib/db.js';
import { plural } from '../lib/format.js';

const MONO = "'Geist Mono',monospace";

const round1 = (n) => Math.round(Number(n || 0) * 10) / 10;
const hoursLabel = (n) => `${n} ${plural(n, 'hour')}`;

export default function HomeCharts() {
  const { state } = useSnapshot();
  const log = state.hoursLog || [];
  const sumHrs = (rows) => rows.reduce((t, h) => t + Number(h.hrs || 0), 0);
  const ownLogged = round1(sumHrs(log.filter((h) => !h.verified)));
  const confirmed = round1(Number(state.stats.verifiedHours || 0) + sumHrs(log.filter((h) => h.verified)));
  const waiting = round1(Math.max(0, Number(state.stats.pendingVerification || 0) - ownLogged));
  const streak = effectiveStreak();
  const best = state.stats.bestStreak || 0;
  const badge = nextBadge();
  const badgeLeft = badge ? round1(badge.remaining) : 0;

  return (
    <section aria-labelledby="home-hours-h" style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
        <h2 id="home-hours-h" style={S('margin:0;font:600 15px/1.2 Geist;letter-spacing:-0.01em;color:#1A1714')}>Your hours</h2>
        <Link href="/profile" className={H.link} style={S('font:500 13px/1 Geist;color:#C2603C;text-decoration:none')}>
          Open Card
        </Link>
      </div>

      <div style={S('margin-top:14px;display:flex;align-items:baseline;gap:8px')}>
        <span style={S(`font:600 26px/1 ${MONO};letter-spacing:-0.03em;color:#1A1714`)}>{confirmed}</span>
        <span style={S('font:450 14px/1.3 Geist;color:#57504A')}>{plural(confirmed, 'hour')} confirmed</span>
      </div>
      <div style={S('margin-top:8px;display:flex;flex-direction:column;gap:5px;font:450 13px/1.45 Geist;color:#6B635C')}>
        {waiting > 0 ? <span data-testid="home-hours-waiting">{hoursLabel(waiting)} waiting on an organizer</span> : null}
        {ownLogged > 0 ? <span data-testid="home-hours-own">{hoursLabel(ownLogged)} logged on your own</span> : null}
        {streak > 0 ? <span>{streak} {plural(streak, 'week')} in a row (best: {Math.max(best, streak)})</span> : null}
        {confirmed === 0 && waiting === 0 && ownLogged === 0 ? <span>Log hours you've already done, or sign up for a shift.</span> : null}
      </div>

      <div style={S('margin-top:16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap')}>
        <Pressable
          label="Log hours"
          onClick={() => openLogHours()}
          className={cx(H.secondary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#1A1714;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
        >
          <Icon name="plus" size={14} color="#C2603C" />
          Log hours
        </Pressable>
        {badge && badgeLeft > 0 ? (
          <Link href="/profile?focus=badges" className={H.link} style={S('font:500 13px/1.3 Geist;color:#C2603C;text-decoration:none')}>
            {hoursLabel(badgeLeft)} to the {badge.need}-hour badge
          </Link>
        ) : null}
      </div>
    </section>
  );
}
