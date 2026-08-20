'use client';

/* ==========================================================================
   Detail.jsx — design screen: `isDetail` (one opportunity)
   ========================================================================== */

import { useRouter, useSearchParams } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, EmptyState } from '../ui.jsx';
import { AddressMap } from '../MapPanel.jsx';
import { useSnapshot } from '../../lib/store.js';
import { openModal, toast, confirmDialog } from '../../lib/overlays.js';
import { getOpportunity, isSaved, toggleSaved, spotsLeft, applicationFor, withdrawApplication, copyText } from '../../lib/db.js';
import { googleCalUrl } from '../../lib/calendar.js';

const MONO = "'Geist Mono',monospace";

export default function Detail({ id }) {
  const router = useRouter();
  const params = useSearchParams();
  useSnapshot(); // subscribe so saves / applications re-render

  const opp = getOpportunity(id);

  if (!opp) {
    return (
      <div className="vu-pad-40" style={S('padding:32px 40px 96px')}>
        <Pressable label="Back to Discover" onClick={() => router.push('/discover')} className={H.toInk} style={S('font:500 13px/1 Geist;color:#8A8179;cursor:pointer;width:max-content')}>
          ← Back to Discover
        </Pressable>
        <EmptyState
          title="That opening is no longer listed"
          body="Organizations take listings down once every spot is filled. There are other shifts near you this week."
          cta="Browse openings"
          onCta={() => router.push('/discover')}
        />
      </div>
    );
  }

  const shiftParam = params.get('shift');
  const selectedId = shiftParam && opp.shifts.some((x) => x.id === shiftParam) ? shiftParam : opp.shifts[0].id;
  const selected = opp.shifts.find((x) => x.id === selectedId);
  const saved = isSaved(opp.id);
  const app = applicationFor(opp.id);
  const applied = !!app && app.st !== 'Withdrawn' && app.st !== 'Declined';
  const full = spotsLeft(selected) <= 0;

  const pickShift = (sid) => router.replace(`/opportunity/${opp.id}?shift=${sid}`, { scroll: false });

  function directions() {
    openModal({
      title: 'Getting there',
      subtitle: `${opp.address} · ${opp.distance} mi from ${'46220'}`,
      body: (
        <div>
          <div style={S('border-radius:12px;overflow:hidden;border:1px solid #E8E1D9')}>
            <AddressMap address={opp.address} />
          </div>
          <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:11px;font:450 14px/1.5 Geist;color:#332D28')}>
            <div style={S('display:flex;justify-content:space-between;gap:12px')}>
              <span style={S('color:#57504A')}>Drive</span>
              <span style={S('font-weight:500')}>{opp.travelMin} min</span>
            </div>
            <div style={S('display:flex;justify-content:space-between;gap:12px')}>
              <span style={S('color:#57504A')}>Transit</span>
              <span style={S('font-weight:500')}>{opp.transit}</span>
            </div>
            <div style={S('display:flex;justify-content:space-between;gap:12px')}>
              <span style={S('color:#57504A')}>Check-in opens</span>
              <span style={S('font-weight:500')}>15 minutes before start</span>
            </div>
          </div>
          <div style={S('margin-top:18px;display:flex;gap:10px;flex-wrap:wrap')}>
            <Pressable
              label="Copy the address"
              onClick={async () => {
                const ok = await copyText(`${opp.org}, ${opp.address}`);
                toast(ok ? { title: 'Address copied', tone: 'ok' } : { title: 'Could not copy', message: `${opp.org}, ${opp.address}`, tone: 'warn' });
              }}
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;cursor:pointer')}
            >
              Copy address
            </Pressable>
            <a
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(opp.address)}`}
              target="_blank"
              rel="noreferrer noopener"
              className={cx(H.secondary, H.press)}
              style={S('display:inline-flex;align-items:center;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C')}
            >
              Open in maps ↗
            </a>
          </div>
        </div>
      ),
    });
  }

  async function withdraw() {
    const ok = await confirmDialog({
      title: 'Withdraw this application?',
      body: `${opp.org} will be told the spot is free again. You can re-apply while shifts are open.`,
      confirmLabel: 'Withdraw',
      tone: 'danger',
    });
    if (!ok) return;
    withdrawApplication(app.id);
    toast({ title: 'Application withdrawn', message: 'The spot went back into the pool.', tone: 'ok' });
  }

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:32px 40px 96px')}>
      <Pressable label="Back to Discover" onClick={() => router.push('/discover')} className={H.toInk} style={S('font:500 13px/1 Geist;color:#8A8179;cursor:pointer;width:max-content')}>
        ← Back to Discover
      </Pressable>

      <div className="vu-split" style={S('display:grid;grid-template-columns:1fr 340px;gap:26px;margin-top:18px;align-items:start')}>
        <div>
          <div style={S('border-radius:16px;overflow:hidden;border:1px solid #E8E1D9;height:300px')}>
            <ImageSlot src={opp.heroImg || opp.img} shape="rect" placeholder={opp.ph} alt={opp.ph} />
          </div>
          <div style={S('margin-top:22px;display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
            <div style={S(`padding:5px 9px;border-radius:7px;background:#F5E7E0;font:500 12px/1 ${MONO};color:#A8482A`)}>{opp.score}% match</div>
            {opp.verified ? <div style={S(`padding:5px 9px;border-radius:7px;background:#EAF3EC;font:500 12px/1 ${MONO};color:#3F6B4E`)}>Vetted org</div> : null}
            <div style={S(`padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 12px/1 ${MONO};color:#57504A`)}>Ages {opp.minAge}+</div>
            <div style={S(`padding:5px 9px;border-radius:7px;background:#F6F2EE;font:500 12px/1 ${MONO};color:#57504A`)}>{opp.groupShift ? 'Group shift' : 'Small team'}</div>
          </div>
          <h1 style={S('margin:14px 0 0;font:600 34px/1.1 Geist;letter-spacing:-0.038em')}>{opp.title}</h1>
          <div style={S('margin-top:10px;font:450 15px/1.5 Geist;color:#6B635C')}>
            {opp.org} · {opp.address} · {opp.distance} mi from you
          </div>
          <p style={S('margin:22px 0 0;max-width:600px;font:400 16px/1.65 Geist;color:#332D28;text-wrap:pretty')}>{opp.description}</p>

          <div className="vu-3col" style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:26px')}>
            {[
              { l: 'Hours earned', v: opp.hours.toFixed(1) },
              { l: 'Travel time', v: `${opp.travelMin} min` },
              { l: 'Cause', v: opp.cause.split(' ')[0].replace('&', '') },
            ].map((k) => (
              <div key={k.l} style={S('padding:16px;border-radius:12px;border:1px solid #E8E1D9;background:#fff')}>
                <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>{k.l}</div>
                <div style={S('margin-top:8px;font:600 22px/1 Geist;letter-spacing:-0.03em')}>{k.v}</div>
              </div>
            ))}
          </div>

          <div style={S('margin-top:26px;border-radius:14px;border:1px solid #E8E1D9;background:#fff;overflow:hidden;max-width:600px')}>
            <AddressMap address={opp.address} />
            <div style={S('padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px')}>
              <div style={S('font:450 13px/1.4 Geist;color:#6B635C')}>
                {opp.distance} mi · {opp.travelMin} min drive · {opp.transit}
              </div>
              <Pressable label={`Directions to ${opp.address}`} onClick={directions} className={H.link} style={S('font:500 12px/1 Geist;color:#C2603C;cursor:pointer;flex:none')}>
                Directions
              </Pressable>
            </div>
          </div>

          <div id="vu-shift-label" style={S(`margin-top:26px;font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>
            Shift times
          </div>
          <div role="radiogroup" aria-labelledby="vu-shift-label" style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px;max-width:600px')}>
            {opp.shifts.map((sh) => {
              const on = sh.id === selectedId;
              const left = spotsLeft(sh);
              return (
                <Pressable
                  key={sh.id}
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  label={`${sh.d}, ${sh.tLong}, ${left === 0 ? 'full' : `${left} of ${sh.cap} left`}`}
                  onClick={() => pickShift(sh.id)}
                  className={cx(on ? '' : H.chip, H.press)}
                  style={s(
                    'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:12px',
                    `border:1px solid ${on ? '#C2603C' : '#E8E1D9'}`,
                    `background:${on ? '#FAF6F3' : '#fff'}`,
                    'cursor:pointer;transition:border-color .16s ease, background .16s ease'
                  )}
                >
                  <div style={s('font:500 15px/1 Geist', on ? '' : 'color:#332D28')}>
                    {sh.d} · {sh.tLong.replace(' to ', '–')}
                  </div>
                  <div style={s(`font:500 12px/1 ${MONO};flex:none`, `color:${left === 0 ? '#A8482A' : on ? '#A8482A' : '#8A8179'}`)}>
                    {left === 0 ? 'full' : `${left} of ${sh.cap} left`}
                  </div>
                </Pressable>
              );
            })}
          </div>
        </div>

        <div className="vu-sticky-side" style={S('display:flex;flex-direction:column;gap:14px;position:sticky;top:28px')}>
          <div style={S('padding:20px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Selected shift</div>
            <div style={S('margin-top:10px;font:600 18px/1.25 Geist;letter-spacing:-0.025em')}>
              {selected.d}
              <br />
              {selected.tLong.replace(' to ', '–')}
            </div>
            <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.4 Geist;color:#57504A')}>
              <div style={S('display:flex;justify-content:space-between;gap:10px')}>
                <span>Hours credited</span>
                <span style={S('color:#1A1714;font-weight:500')}>{opp.hours.toFixed(1)} verified</span>
              </div>
              <div style={S('display:flex;justify-content:space-between;gap:10px')}>
                <span>Counts for school</span>
                <span style={S('color:#1A1714;font-weight:500')}>{opp.countsForSchool ? 'Yes' : 'No'}</span>
              </div>
              <div style={S('display:flex;justify-content:space-between;gap:10px')}>
                <span>{opp.groupShift ? 'Group shift' : 'Team size'}</span>
                <span style={S('color:#1A1714;font-weight:500')}>{selected.cap} volunteers</span>
              </div>
            </div>

            {applied ? (
              <>
                <div style={S('margin-top:18px;padding:14px;border-radius:11px;background:#EAF3EC;border:1px solid #DCEADF')}>
                  <div style={S('font:600 13px/1.3 Geist;color:#3F6B4E')}>
                    {app.st === 'Accepted' ? 'You are confirmed for this shift' : `Application ${String(app.st).toLowerCase()}`}
                  </div>
                  <div style={S('margin-top:5px;font:450 12px/1.45 Geist;color:#4E6B57')}>
                    {app.st === 'Accepted' ? 'Check-in opens 15 minutes before start.' : `Sent ${app.when}. ${opp.replyTime}`}
                  </div>
                </div>
                {googleCalUrl(opp, selected) ? (
                  <a
                    href={googleCalUrl(opp, selected)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={cx(H.secondaryLift, H.press)}
                    style={S('margin-top:12px;display:flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap;padding:0 18px;height:40px;border-radius:11px;border:1px solid #E7C0AC;background:#fff;font:600 14px/1 Geist;color:#C2603C;cursor:pointer;text-decoration:none;transition:background .16s ease, border-color .16s ease, transform .16s ease')}
                  >
                    Add to calendar ↗
                  </a>
                ) : null}
                <Pressable
                  label="Withdraw this application"
                  onClick={withdraw}
                  className={cx(H.secondaryLift, H.press)}
                  style={S('margin-top:12px;display:flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap;padding:0 18px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#8A8179;cursor:pointer;transition:background .16s ease, border-color .16s ease, transform .16s ease')}
                >
                  Withdraw application
                </Pressable>
              </>
            ) : (
              <Pressable
                label={full ? 'This shift is full' : `Apply for ${selected.d}`}
                disabled={full}
                onClick={() => router.push(`/apply/${opp.id}?shift=${selectedId}`)}
                className={cx(full ? '' : H.primaryLift, H.press)}
                style={S('margin-top:18px;display:flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap;padding:0 18px;height:46px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);transition:transform .16s ease, box-shadow .16s ease, background .16s ease')}
              >
                <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>▷</span>
                {full ? 'Shift is full' : 'Apply for this shift'}
              </Pressable>
            )}

            <Pressable
              label={saved ? 'Remove from shortlist' : 'Save for later'}
              pressed={saved}
              onClick={() => {
                const now = toggleSaved(opp.id);
                toast(
                  now
                    ? { title: 'Saved to your shortlist', message: opp.title, tone: 'ok', actionLabel: 'Undo', onAction: () => toggleSaved(opp.id) }
                    : { title: 'Removed from your shortlist', tone: 'brand', actionLabel: 'Undo', onAction: () => toggleSaved(opp.id) }
                );
              }}
              className={cx(H.secondaryLift, H.press)}
              style={s(
                'margin-top:10px;display:flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap;padding:0 18px;height:40px;border-radius:11px',
                `border:1px solid ${saved ? '#E4C9BB' : '#E4DDD4'}`,
                `background:${saved ? '#FAF6F3' : '#fff'}`,
                `font:600 14px/1 Geist;color:${saved ? '#A8482A' : '#1A1714'}`,
                'cursor:pointer;transition:background .16s ease, border-color .16s ease, transform .16s ease'
              )}
            >
              {saved ? 'Saved to shortlist' : 'Save for later'}
            </Pressable>
            <div style={S('margin-top:14px;font:450 12px/1.5 Geist;color:#A9A097')}>
              Check-in opens 15 minutes before start. Hours post automatically when you check out.
            </div>
          </div>

          <div style={S('padding:18px;border-radius:14px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Safety</div>
            <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:9px;font:450 13px/1.45 Geist;color:#332D28')}>
              {opp.safety.map((x) => (
                <div key={x} style={S('display:flex;gap:9px')}>
                  <span aria-hidden="true" style={S('color:#3F6B4E')}>✓</span>
                  {x}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
