'use client';

/* ==========================================================================
   CrossApplications.jsx, applications from other volunteers
   Shown at the top of the Lead workspace. Reads the shared applications
   table; accept and decline write straight back, with Undo on the toast.
   Renders nothing (or the caller's empty state) when nothing is pending.
   Pass `listingId` to scope it to one project's listing. A project with no
   published listing passes undefined and sees none; omit the prop entirely
   to show every listing the account owns.
   As a tab's main content (`emptyState` passed, or `history`), it also lists
   accepted, declined and withdrawn applications under status filters, so a
   decision can be found and undone after the toast is gone.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S, cx, H } from '../lib/style.js';
import { loadOwnerApplications, setApplicationStatus } from '../lib/listings.js';
import { toast, openModal } from '../lib/overlays.js';
import MessageThread from './MessageThread.jsx';
import { APPLICATION_STATUS } from '../lib/seed.js';

const BTN = 'padding:0 14px;height:36px;border-radius:10px;font:600 13px/1 Geist;cursor:pointer';
const MONO = "'Geist Mono',monospace";

// Labels come from APPLICATION_STATUS so the lead and the volunteer see the
// same word for each status ("Not accepted", never "Declined").
const DECIDED = [
  { k: 'accepted', bg: '#EAF3EC', color: '#3F6B4E' },
  { k: 'declined', bg: '#F5E7E0', color: '#A8482A' },
  { k: 'withdrawn', bg: '#F6F2EE', color: '#6B635C' },
].map((d) => ({ ...d, l: APPLICATION_STATUS[d.k].label }));

/** "2026-10-17T…" → "Sat, Oct 17" (year added when it isn't this year). */
function shortDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

function factsFor(app) {
  return [app.listings && app.listings.name ? `For ${app.listings.name}` : 'For your project', app.position || ''].filter(Boolean).join(', ');
}

function openThread(app) {
  openModal({
    title: app.applicant_name,
    subtitle: app.listings && app.listings.name ? `About ${app.listings.name}` : 'Application',
    Body: () => <MessageThread applicationId={app.id} recipientId={app.applicant_id} recipientName={app.applicant_name} />,
  });
}

function MessageButton({ app }) {
  return (
    <button
      type="button"
      onClick={() => openThread(app)}
      aria-label={`Message ${app.applicant_name}`}
      className={cx(H.secondary, H.press)}
      style={S(`${BTN};border:1px solid #E7C0AC;background:#fff;color:#C2603C`)}
    >
      Message
    </button>
  );
}

/** Tell other widgets (Lead overview counts, team status) to reload. */
function announceChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('vu:applications-changed'));
}

export default function CrossApplications(props) {
  const { emptyState = null, listingId } = props;
  const scoped = Object.prototype.hasOwnProperty.call(props, 'listingId');
  // Tab mode: the caller gave an empty state, so this is the screen's main
  // content and past decisions belong here too. The Overview banner omits it.
  const history = props.history !== undefined ? !!props.history : Object.prototype.hasOwnProperty.call(props, 'emptyState');
  const [apps, setApps] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(null);
  const [view, setView] = useState(null);

  async function load() {
    try {
      setApps(await loadOwnerApplications());
      setFailed(false);
    } catch (err) {
      console.error('[lead] could not load applications', err);
      setFailed(true);
      setApps([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (apps === null) return null;
  if (failed && emptyState) {
    return (
      <div role="alert" style={S('padding:20px;border-radius:16px;border:1px solid #EFE3DC;background:#FAF6F3;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
        <div style={S('font:450 14px/1.5 Geist;color:#57504A')}>Couldn't load applications. Check your connection and try again.</div>
        <button type="button" onClick={load} className={cx(H.secondary, H.press)} style={S(`${BTN};border:1px solid #E4DDD4;background:#fff;color:#1A1714`)}>Try again</button>
      </div>
    );
  }
  const mine = apps.filter((a) => !scoped || (listingId && a.listing_id === listingId));
  const pending = mine.filter((a) => a.status === 'pending');
  const decided = history ? mine.filter((a) => DECIDED.some((d) => d.k === a.status)) : [];
  // As a banner (Overview) this stays silent when empty; as a tab's primary
  // content it can render a caller-provided empty state instead.
  if (!pending.length && !decided.length) return emptyState;

  async function revert(app, { announce = false } = {}) {
    if (busy) return;
    setBusy(app.id);
    const { ok, error } = await setApplicationStatus(app.id, 'pending');
    if (!ok) {
      console.error('[lead] could not undo decision', error);
      toast({ title: "Couldn't undo", message: 'Check your connection and try again.', tone: 'danger' });
    } else {
      announceChange();
      if (announce) toast({ title: 'Decision undone', message: `${app.applicant_name} is waiting on you again.`, tone: 'ok' });
    }
    await load();
    setBusy(null);
  }

  async function decide(app, status) {
    if (busy) return;
    setBusy(app.id);
    const { ok, error } = await setApplicationStatus(app.id, status);
    if (ok) {
      toast({
        title: status === 'accepted' ? `Accepted ${app.applicant_name}` : `Declined ${app.applicant_name}`,
        message: status === 'accepted' ? "They'll see it on their Home tab." : "They'll see they weren't accepted.",
        tone: 'ok',
        actionLabel: 'Undo',
        onAction: () => revert(app),
      });
      announceChange();
      load();
    } else {
      console.error('[lead] could not save decision', error);
      toast({ title: "Couldn't save that", message: 'Check your connection and try again.', tone: 'danger' });
    }
    setBusy(null);
  }

  const pendingBlock = pending.length ? (
    <section aria-label="New applications" style={S('padding:20px;border-radius:16px;border:1px solid #EFE3DC;background:#FAF6F3')}>
      <h2 style={S('margin:0;font:600 18px/1.25 Geist;letter-spacing:-0.025em')}>
        {pending.length} new {pending.length === 1 ? 'application' : 'applications'}
      </h2>
      <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
        {pending.map((app) => (
          <Row key={app.id} app={app}>
            <MessageButton app={app} />
            <button
              type="button"
              onClick={() => decide(app, 'declined')}
              disabled={busy === app.id}
              aria-label={`Decline ${app.applicant_name}`}
              className={cx(H.secondary, H.press)}
              style={S(`${BTN};border:1px solid #E4DDD4;background:#fff;color:#57504A`)}
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => decide(app, 'accepted')}
              disabled={busy === app.id}
              aria-label={`Accept ${app.applicant_name}`}
              className={cx(H.primary, H.press)}
              style={S(`${BTN};padding:0 15px;border:1px solid #A8482A;background:#C2603C;color:#fff`)}
            >
              Accept
            </button>
          </Row>
        ))}
      </div>
    </section>
  ) : (
    emptyState
  );

  if (!decided.length) return pendingBlock;

  const counts = Object.fromEntries(DECIDED.map((d) => [d.k, decided.filter((a) => a.status === d.k).length]));
  const filters = DECIDED.filter((d) => counts[d.k] > 0);
  const active = filters.some((f) => f.k === view) ? view : filters[0].k;
  const rows = decided.filter((a) => a.status === active);

  return (
    <>
      {pendingBlock}
      <section aria-label="Past applications" style={S('padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
        <h2 style={S('margin:0;font:600 16px/1.3 Geist;letter-spacing:-0.015em;color:#1A1714')}>Past applications</h2>
        <div role="group" aria-label="Filter past applications" className="vu-scroll-x" style={S('margin-top:12px;display:flex;gap:8px')}>
          {filters.map((f) => {
            const on = f.k === active;
            return (
              <button
                key={f.k}
                type="button"
                aria-pressed={on}
                aria-label={`${f.l}, ${counts[f.k]}`}
                onClick={() => setView(f.k)}
                className={cx(on ? '' : H.chip, H.press)}
                style={S(`flex:none;padding:8px 13px;border-radius:9px;font:500 13px/1 Geist;cursor:pointer;white-space:nowrap;border:1px solid ${on ? '#1F1B18' : '#E8E1D9'};background:${on ? '#1F1B18' : '#FFFFFF'};color:${on ? '#FFFFFF' : '#57504A'}`)}
              >
                {f.l} <span style={S(`font:500 10px/1 ${MONO};opacity:.75`)}>{counts[f.k]}</span>
              </button>
            );
          })}
        </div>
        <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:10px')}>
          {rows.map((app) => {
            const st = DECIDED.find((d) => d.k === app.status);
            const when = shortDate(app.decided_at);
            return (
              <Row key={app.id} app={app} chip={st} when={when ? `${st.l} ${when}` : ''}>
                <MessageButton app={app} />
                {app.status === 'withdrawn' ? null : (
                  <button
                    type="button"
                    onClick={() => revert(app, { announce: true })}
                    disabled={busy === app.id}
                    aria-label={`Undo the decision for ${app.applicant_name}`}
                    className={cx(H.secondary, H.press)}
                    style={S(`${BTN};border:1px solid #E4DDD4;background:#fff;color:#57504A`)}
                  >
                    Undo
                  </button>
                )}
              </Row>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Row({ app, chip, when, children }) {
  return (
    <div style={S('padding:14px 16px;border-radius:12px;background:#fff;border:1px solid #F1EBE4;display:flex;align-items:center;gap:12px;flex-wrap:wrap')}>
      <div style={S('min-width:0;flex:1 1 220px')}>
        <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
          <div className="vu-break" style={S('min-width:0;font:600 14px/1.2 Geist;color:#1A1714')}>{app.applicant_name}</div>
          {chip ? <span style={S(`padding:4px 8px;border-radius:6px;font:500 11px/1 Geist;background:${chip.bg};color:${chip.color}`)}>{chip.l}</span> : null}
        </div>
        <div className="vu-break" style={S('margin-top:3px;font:450 12px/1.45 Geist;color:#8A8179')}>
          {factsFor(app)}
          {when ? `. ${when}` : ''}
        </div>
        {app.note ? <div className="vu-break" style={S('margin-top:6px;font:450 13px/1.45 Geist;color:#57504A')}>“{app.note}”</div> : null}
      </div>
      <div style={S('display:flex;gap:8px;flex:none;flex-wrap:wrap')}>{children}</div>
    </div>
  );
}
