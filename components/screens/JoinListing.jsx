'use client';

/* ==========================================================================
   JoinListing.jsx — the public page a shared link opens
   This is what a stranger sees when a founder shares their project link. It is
   the nonprofit's public profile AND the apply entry point: anyone can view it
   signed out; applying funnels through sign-in and lands back here. It reads the
   real Supabase listing (never local seed data), so it works across accounts.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot } from '../ui.jsx';
import { toast } from '../../lib/overlays.js';
import { getListing, applyToListing, loadMyApplications, myId } from '../../lib/listings.js';
import AnnouncementBoard from '../AnnouncementBoard.jsx';

const MONO = "'Geist Mono',monospace";
const KIND = { meeting: '◷ Briefing', form: '▤ Form', training: '◈ Training', check: '✓ Check' };

export default function JoinListing({ id }) {
  const router = useRouter();
  const [listing, setListing] = useState(undefined); // undefined=loading, null=missing
  const [me, setMe] = useState(undefined);
  const [app, setApp] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [l, uid] = await Promise.all([getListing(id), myId()]);
      if (!alive) return;
      setListing(l);
      setMe(uid || null);
      if (uid && l) {
        try {
          const mine = await loadMyApplications();
          const found = mine.find((a) => a.listing_id === l.id);
          if (alive && found) setApp(found);
        } catch { /* ignore */ }
      }
    })();
    return () => { alive = false; };
  }, [id]);

  async function apply() {
    if (busy || !listing) return;
    if (!me) { router.push(`/signin?next=${encodeURIComponent(`/join/${id}`)}`); return; }
    setBusy(true);
    try {
      await applyToListing(listing, { note: '' });
      const mine = await loadMyApplications();
      setApp(mine.find((a) => a.listing_id === listing.id) || { status: 'pending' });
      toast({ title: 'Application sent', message: `${listing.name} will see it in their workspace.`, tone: 'ok' });
    } catch (e) {
      toast({ title: 'We could not send that', message: e.message, tone: 'danger' });
    }
    setBusy(false);
  }

  if (listing === undefined) {
    return <Shell><div style={S('padding:60px 0;text-align:center;font:450 15px/1.5 Geist;color:#8A8179')}>Loading…</div></Shell>;
  }
  if (listing === null || listing.status !== 'live') {
    return (
      <Shell>
        <div style={S('padding:48px 32px;text-align:center;border-radius:18px;border:1px solid #E8E1D9;background:#fff')}>
          <div style={S('font:600 22px/1.2 Geist;letter-spacing:-0.03em')}>This project link isn't active</div>
          <div style={S('margin-top:10px;font:450 14px/1.6 Geist;color:#6B635C')}>It may have been paused or the link is wrong. Browse other projects instead.</div>
          <Link href="/discover" style={S('display:inline-block;margin-top:18px;padding:0 18px;height:44px;line-height:44px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;text-decoration:none')}>Explore VolunteerU</Link>
        </div>
      </Shell>
    );
  }

  const isTeam = listing.org_type === 'team';
  const roles = listing.task_roles || [];
  const positions = listing.positions || [];
  const pipeline = (listing.pipeline || []).filter((x) => x && x.label);
  const STATUS = { pending: 'Under review', accepted: 'You’re in', declined: 'Not this time', withdrawn: 'Withdrawn' };

  return (
    <Shell>
      <div style={S('border-radius:18px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
        <div style={S('height:180px;position:relative')}>
          <ImageSlot src={listing.cover} shape="rounded" radius={0} placeholder="cover" />
        </div>
        <div style={S('padding:24px 28px 28px')}>
          <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
            {listing.org_class === 'official' ? (
              <span style={S(`padding:4px 9px;border-radius:6px;background:#EAF3EC;font:500 10px/1 ${MONO};color:#3F6B4E`)}>Nonprofit</span>
            ) : (
              <span style={S(`padding:4px 9px;border-radius:6px;background:#FDF3E7;font:500 10px/1 ${MONO};color:#8A5A20`)}>Student-led</span>
            )}
            {listing.verified ? <span style={S(`padding:4px 9px;border-radius:6px;background:#EAF3EC;font:500 10px/1 ${MONO};color:#3F6B4E`)}>✓ Verified</span> : null}
            <span style={S(`padding:4px 9px;border-radius:6px;background:#F1EBE4;font:500 10px/1 ${MONO};color:#57504A`)}>{isTeam ? 'Project team' : 'Volunteer program'}</span>
            {listing.cause ? <span style={S(`padding:4px 9px;border-radius:6px;background:#EAF3EC;font:500 10px/1 ${MONO};color:#3F6B4E`)}>{listing.cause}</span> : null}
          </div>
          <h1 style={S('margin:14px 0 0;font:600 30px/1.1 Geist;letter-spacing:-0.04em')}>{listing.name}</h1>
          {listing.site ? <div style={S('margin-top:8px;font:450 14px/1.4 Geist;color:#8A8179')}>{listing.site}</div> : null}
          {listing.mission ? <div style={S('margin-top:16px;font:400 16px/1.6 Geist;color:#332D28;max-width:640px')}>{listing.mission}</div> : null}
          {listing.bio ? <div style={S('margin-top:12px;font:450 14px/1.6 Geist;color:#57504A;max-width:640px')}>{listing.bio}</div> : null}

          {(listing.events_hosted || listing.approx_volunteers) ? (
            <div style={S('margin-top:20px;display:flex;gap:12px;flex-wrap:wrap')}>
              {listing.events_hosted ? <Stat v={listing.events_hosted} l="events hosted" /> : null}
              {listing.approx_volunteers ? <Stat v={listing.approx_volunteers} l="volunteers reached" /> : null}
            </div>
          ) : null}

          {/* apply / status */}
          <div style={S('margin-top:24px;padding:18px;border-radius:14px;border:1px solid #EFE3DC;background:#FAF6F3;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap')}>
            {app ? (
              <>
                <div style={S('min-width:0')}>
                  <div style={S('font:600 15px/1.3 Geist;color:#1A1714')}>{STATUS[app.status] || 'Applied'}</div>
                  <div style={S('margin-top:4px;font:450 13px/1.5 Geist;color:#6B635C')}>{app.status === 'accepted' ? 'Open the app to see your role and next steps.' : 'The organizer has your application. Watch for a reply.'}</div>
                </div>
                <Link href="/app" style={S('flex:none;padding:0 18px;height:46px;line-height:46px;border-radius:12px;border:1px solid #E4DDD4;background:#fff;color:#1A1714;font:600 14px/1 Geist;text-decoration:none')}>Open VolunteerU</Link>
              </>
            ) : (
              <>
                <div style={S('min-width:0')}>
                  <div style={S('font:600 15px/1.3 Geist;color:#1A1714')}>Want to join?</div>
                  <div style={S('margin-top:4px;font:450 13px/1.5 Geist;color:#6B635C')}>{me ? 'Send an application and the organizer will be in touch.' : 'Sign in or make a free account to apply — it takes a minute.'}</div>
                </div>
                <button type="button" onClick={apply} disabled={busy} className={cx(H.press)} style={S('flex:none;padding:0 20px;height:46px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer')}>
                  {busy ? 'Sending…' : me ? 'Apply to join' : 'Sign in to apply'}
                </button>
              </>
            )}
          </div>

          {/* roles (team) or positions (volunteering) */}
          {isTeam && roles.length ? (
            <Section title="Roles on this team">
              {roles.map((r) => (
                <div key={r.id} style={S('padding:14px 16px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                  <div style={S('display:flex;align-items:center;gap:8px')}>
                    <span style={s('width:9px;height:9px;border-radius:50%;flex:none', `background:${r.color || '#C2603C'}`)} />
                    <div style={S('font:600 14px/1.2 Geist')}>{r.name}</div>
                  </div>
                  {r.briefing ? <div style={S('margin-top:6px;font:450 12.5px/1.5 Geist;color:#57504A')}>{r.briefing}</div> : null}
                </div>
              ))}
            </Section>
          ) : null}
          {!isTeam && positions.length ? (
            <Section title="Roles they need">
              {positions.map((pos) => (
                <div key={pos.id || pos.t} style={S('padding:12px 14px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                  <div style={S('font:600 14px/1.2 Geist')}>{pos.t}</div>
                  {pos.m ? <div style={S('margin-top:4px;font:450 12px/1.4 Geist;color:#8A8179')}>{pos.m}</div> : null}
                </div>
              ))}
            </Section>
          ) : null}

          {/* pipeline preview (volunteering) */}
          {!isTeam && pipeline.length ? (
            <Section title="Before your first shift">
              {pipeline.map((step, i) => (
                <div key={step.id || i} style={S('display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                  <span style={S(`width:22px;height:22px;border-radius:7px;flex:none;display:grid;place-items:center;background:#F1EBE4;font:600 10px/1 ${MONO};color:#8A8179`)}>{i + 1}</span>
                  <div style={S('font:500 13px/1.3 Geist;color:#332D28')}>{step.label}</div>
                  <span style={S(`margin-left:auto;font:500 10px/1 ${MONO};color:#A9A097`)}>{KIND[step.kind] || 'Step'}</span>
                </div>
              ))}
            </Section>
          ) : null}

          {(listing.announcements || []).length ? (
            <div style={S('margin-top:24px')}>
              <AnnouncementBoard listingId={listing.id} title="From the organizer" />
            </div>
          ) : null}

          {listing.website ? (
            <div style={S('margin-top:22px')}>
              <a href={listing.website} target="_blank" rel="noreferrer noopener" style={S('font:500 14px/1 Geist;color:#C2603C;text-decoration:none')}>Visit their page ↗</a>
            </div>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={S('min-height:100vh;padding:32px 24px 80px')}>
      <div style={S('max-width:720px;margin:0 auto')}>
        <Link href="/" style={S('display:inline-flex;align-items:center;gap:9px;text-decoration:none;margin-bottom:22px')}>
          <span style={S('width:30px;height:30px;border-radius:9px;background:linear-gradient(180deg,#D2775B,#C2603C);color:#fff;font:700 15px/30px Geist;text-align:center')}>V</span>
          <span style={S('font:600 17px/1 Geist;letter-spacing:-0.02em;color:#1A1714')}>VolunteerU</span>
        </Link>
        {children}
      </div>
    </div>
  );
}

function Stat({ v, l }) {
  return (
    <div style={S('flex:1;min-width:150px;padding:14px 16px;border-radius:12px;border:1px solid #E8E1D9;background:#fff')}>
      <div style={S('font:600 24px/1 Geist;letter-spacing:-0.03em')}>{v}</div>
      <div style={S('margin-top:5px;font:450 12px/1 Geist;color:#8A8179')}>{l}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={S('margin-top:24px')}>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>{title}</div>
      <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px')}>{children}</div>
    </div>
  );
}
