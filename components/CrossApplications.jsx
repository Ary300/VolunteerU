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
   Pass `local` as well and the project's own applications (the ones kept in
   the project, `project.applications`) join the same list: one filter, one
   row pattern and one set of actions for everyone who applied.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S, s, cx, H } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import { loadOwnerApplications, setApplicationStatus, myShiftSignUps } from '../lib/listings.js';
import { toast, openModal } from '../lib/overlays.js';
import MessageThread from './MessageThread.jsx';
import { APPLICATION_STATUS } from '../lib/seed.js';
import { Avatar, Button, Chip, IconButton, Pressable, StatusText } from './ui.jsx';
import { Sep } from './vu/ListingCard.jsx';

// Labels come from APPLICATION_STATUS so the lead and the volunteer see the
// same word for each status ("Not accepted", never "Declined").
const DECIDED = [
  { k: 'accepted', tone: 'ok' },
  { k: 'waitlisted', tone: 'mute' },
  { k: 'declined', tone: 'bad' },
  { k: 'withdrawn', tone: 'mute' },
].map((d) => ({ ...d, l: APPLICATION_STATUS[d.k].label }));
const H2 = `margin:0;font:650 22px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`;

/* The combined list's filters, in the Applications tab's words. Withdrawn
   only shows up when someone withdrew. */
const LIST_FILTERS = [
  { k: 'pending', l: 'Waiting on you' },
  { k: 'accepted', l: 'Accepted' },
  { k: 'waitlisted', l: 'Waitlisted' },
  { k: 'declined', l: 'Declined' },
  { k: 'withdrawn', l: 'Withdrawn', optional: true },
  { k: 'all', l: 'All' },
];
const ANSWERS_LINK = `font:600 13px/1.2 ${F.body};color:${C.ink};text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px;cursor:pointer;background:none;border:0;padding:0;white-space:nowrap`;
const LIST_STATUS = {
  accepted: { l: 'Accepted', tone: 'ok' },
  waitlisted: { l: 'Waitlisted', tone: 'mute' },
  declined: { l: 'Declined', tone: 'bad' },
  withdrawn: { l: 'Withdrawn', tone: 'mute' },
};

/* The combined list's rows keep their actions in one fixed trailing column
   on wide screens, so Accept, Waitlist, Decline and the message icon line up
   down the list whatever each row holds. Phones keep the shared row's
   wrap-under layout. */
const LIST_CSS = `
@media (min-width:720px) {
  .vu-apps-row { grid-template-columns:auto minmax(0,1fr) 300px; }
  .vu-apps-end { min-width:0; }
}
.vu-apps-msg { flex:none; width:36px; height:36px; }
`;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** When a row's application came in, as epoch ms for sorting. Join-link rows
    carry created_at; the project's own rows carry createdAt/at when saved
    recently and otherwise only their "Oct 15" label (this year, or last year
    when that date is still ahead). Unknown dates sort last. */
function appliedMs(e) {
  const a = e.a;
  if (e.kind === 'cross') {
    const t = Date.parse(a.created_at || '');
    return Number.isNaN(t) ? -Infinity : t;
  }
  for (const v of [a.createdAt, a.at]) {
    const t = typeof v === 'number' ? v : Date.parse(v || '');
    if (!Number.isNaN(t)) return t;
  }
  const w = String(a.when || '').trim().toLowerCase();
  if (w === 'just now' || w === 'today') return Date.now();
  const m = w.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  const mon = m ? MONTHS.indexOf(m[1]) : -1;
  if (mon < 0) return -Infinity;
  const now = new Date();
  const d = new Date(m[3] ? Number(m[3]) : now.getFullYear(), mon, Number(m[2]));
  if (!m[3] && d.getTime() > now.getTime() + 86400000) d.setFullYear(d.getFullYear() - 1);
  return d.getTime();
}

/** "2026-10-17T…" → "Oct 17" (year added when it isn't this year). */
function monthDay(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "Line packer · Applied Oct 16" as ordered parts. Inside one project the
    project's name is the page title, so only the account-wide list (no
    `listingId`) names the listing: "For Saturday Food Distribution · …". */
/** The shift an applicant picked on the join page ("Sat, Oct 31", or
    "Sat, Oct 31 and 1 more"), so the lead knows the date before accepting. */
function pickedShift(app) {
  if (app.status === 'withdrawn' || app.status === 'declined') return '';
  const mine = myShiftSignUps(app).filter((x) => !x.past && x.d);
  if (!mine.length) return '';
  return mine.length > 1 ? `${mine[0].d} and ${mine.length - 1} more` : String(mine[0].d);
}

function factsFor(app, scoped) {
  const applied = monthDay(app.created_at);
  return [
    scoped ? '' : app.listings && app.listings.name ? `For ${app.listings.name}` : 'For your project',
    app.position || '',
    pickedShift(app),
    applied ? `Applied ${applied}` : '',
  ].filter(Boolean);
}

/** "Ava" from "Ava Lin", for the toast's Message button. */
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'them';

function openThread(app) {
  openModal({
    title: app.applicant_name,
    subtitle: app.listings && app.listings.name ? `About ${app.listings.name}` : 'Application',
    Body: () => <MessageThread applicationId={app.id} recipientId={app.applicant_id} recipientName={app.applicant_name} />,
  });
}

function MessageButton({ app }) {
  return <IconButton icon="message" label={`Message ${app.applicant_name}`} onClick={() => openThread(app)} />;
}

/** Tell other widgets (Lead overview counts, team status) to reload. */
function announceChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('vu:applications-changed'));
}

function LoadError({ onRetry }) {
  return (
    <div role="alert">
      <p style={S(`margin:0;font:400 15px/1.5 ${F.body};color:${C.ink2}`)}>Couldn't load applications. Check your connection and try again.</p>
      <div style={S('margin-top:12px')}>
        <Button size="sm" icon="refresh" onClick={onRetry}>Try again</Button>
      </div>
    </div>
  );
}

export default function CrossApplications(props) {
  const { emptyState = null, listingId, title, local = null } = props;
  const scoped = Object.prototype.hasOwnProperty.call(props, 'listingId');
  // Tab mode: the caller gave an empty state, so this is the screen's main
  // content and past decisions belong here too. The Overview banner omits it.
  const history = !!local || (props.history !== undefined ? !!props.history : Object.prototype.hasOwnProperty.call(props, 'emptyState'));
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
  if (failed && emptyState && !local) return <LoadError onRetry={load} />;
  const mine = apps.filter((a) => !scoped || (listingId && a.listing_id === listingId));

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
      const words = {
        accepted: [`Accepted ${app.applicant_name}`, "They'll see it on their Home tab."],
        waitlisted: [`Waitlisted ${app.applicant_name}`, "They'll see they're on the waitlist."],
        declined: [`Declined ${app.applicant_name}`, "They'll see they weren't accepted."],
      }[status];
      toast({
        title: words[0],
        message: words[1],
        tone: 'ok',
        actionLabel: 'Undo',
        onAction: () => revert(app),
        // The accepted row leaves the Waiting on you list, so the reply
        // starts here instead of on another filter.
        ...(status === 'accepted' && app.applicant_id ? { secondLabel: `Message ${firstName(app.applicant_name)}`, onSecond: () => openThread(app), timeout: 7000 } : {}),
      });
      announceChange();
      load();
    } else {
      console.error('[lead] could not save decision', error);
      toast({ title: "Couldn't save that", message: 'Check your connection and try again.', tone: 'danger' });
    }
    setBusy(null);
  }

  if (local) {
    return (
      <ApplicationList
        cross={mine.filter((a) => a.status === 'pending' || DECIDED.some((d) => d.k === a.status))}
        local={local}
        busy={busy}
        failed={failed}
        onRetry={load}
        emptyState={emptyState}
        onDecide={decide}
        onRevert={(app) => revert(app, { announce: true })}
      />
    );
  }

  const pending = mine.filter((a) => a.status === 'pending');
  const decided = history ? mine.filter((a) => DECIDED.some((d) => d.k === a.status)) : [];
  // As a banner (Overview) this stays silent when empty; as a tab's primary
  // content it can render a caller-provided empty state instead.
  if (!pending.length && !decided.length) return emptyState;

  const pendingBlock = pending.length ? (
    <section aria-label="New applications">
      <h2 style={S(H2)}>
        {title ? (
          <>
            {title} <span style={S(`font-weight:500;color:${C.ink2};font-variant-numeric:tabular-nums`)}>{pending.length}</span>
          </>
        ) : (
          `${pending.length} new ${pending.length === 1 ? 'application' : 'applications'}`
        )}
      </h2>
      <ul className="vu-list" style={S('margin:16px 0 0;padding:0;list-style:none')}>
        {pending.map((app) => (
          <Row key={app.id} name={app.applicant_name} facts={factsFor(app, scoped)} note={app.note}>
            <PendingActions name={app.applicant_name} busy={busy === app.id} onAccept={() => decide(app, 'accepted')} onDecline={() => decide(app, 'declined')} />
            <MessageButton app={app} />
          </Row>
        ))}
      </ul>
    </section>
  ) : (
    emptyState
  );

  if (!decided.length) return pendingBlock;

  const counts = Object.fromEntries(DECIDED.map((d) => [d.k, decided.filter((a) => a.status === d.k).length]));
  const filters = DECIDED.filter((d) => counts[d.k] > 0);
  const active = filters.some((f) => f.k === view) ? view : filters[0].k;
  // One status has nothing to filter between: list every past decision and
  // let each row's status word say what it is.
  const rows = filters.length > 1 ? decided.filter((a) => a.status === active) : decided;

  return (
    <>
      {pendingBlock}
      <section aria-label="Past applications" style={S('margin-top:40px')}>
        <h2 style={S(H2)}>Past applications</h2>
        {filters.length > 1 ? (
          <div role="group" aria-label="Filter past applications" className="vu-scroll-x" style={S('margin-top:14px;display:flex;gap:8px')}>
            {filters.map((f) => (
              <Chip key={f.k} label={f.l} count={counts[f.k]} on={f.k === active} onClick={() => setView(f.k)} ariaLabel={`${f.l}, ${counts[f.k]}`} />
            ))}
          </div>
        ) : null}
        <ul className="vu-list" style={S('margin:16px 0 0;padding:0;list-style:none')}>
          {rows.map((app) => {
            const st = DECIDED.find((d) => d.k === app.status);
            const when = monthDay(app.decided_at);
            // The status word carries the decision date: "Accepted Oct 12".
            return (
              <Row key={app.id} name={app.applicant_name} facts={factsFor(app, scoped)} note={app.note} status={{ ...st, l: when ? `${st.l} ${when}` : st.l }}>
                {app.status === 'withdrawn' ? null : (
                  <UndoButton name={app.applicant_name} busy={busy === app.id} onClick={() => revert(app, { announce: true })} />
                )}
                <MessageButton app={app} />
              </Row>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/* ---- one list for the Applications tab --------------------------------- */

/* Join-link applications (shared table) and the project's own applications
   (`local.items`: { id, n, s, role, when, note, status, flags, answers }) in
   one list, newest application first. The caller owns the local decisions
   and the filter, which lives in the URL:
     local = { items, filter, onFilter(k), onDecide(a, 'accepted'|'waitlisted'|'declined'),
               onUndo(a), onAnswers(a) | null, renderEmpty(filter) }
   Every row has the same action slots: Accept, Waitlist, Decline and the
   message icon (an empty slot when the applicant has no account to write
   to, which is the case for the project's own rows). */
function ApplicationList({ cross, local, busy, failed, onRetry, emptyState, onDecide, onRevert }) {
  const entries = [
    ...cross.map((a) => ({ key: `x-${a.id}`, kind: 'cross', status: a.status, name: a.applicant_name, a })),
    ...(local.items || []).map((a) => ({ key: `l-${a.id}`, kind: 'local', status: a.status, name: a.n, a })),
  ]
    .map((e) => ({ ...e, at: appliedMs(e) }))
    .sort((x, y) => (y.at === x.at ? 0 : y.at > x.at ? 1 : -1));
  const counts = Object.fromEntries(LIST_FILTERS.map((f) => [f.k, f.k === 'all' ? entries.length : entries.filter((e) => e.status === f.k).length]));
  const filters = LIST_FILTERS.filter((f) => !f.optional || counts[f.k] > 0);
  const filter = filters.some((f) => f.k === local.filter) ? local.filter : 'pending';
  const rows = filter === 'all' ? entries : entries.filter((e) => e.status === filter);
  const error = failed ? <LoadError onRetry={onRetry} /> : null;
  if (!entries.length) return error || emptyState;

  return (
    <section aria-label="Applications">
      <style dangerouslySetInnerHTML={{ __html: LIST_CSS }} />
      {error ? <div style={S('margin-bottom:32px')}>{error}</div> : null}
      <div className="vu-scroll-x" role="group" aria-label="Filter applications" style={S('margin:0 -2px;padding:2px;display:flex;gap:8px')}>
        {filters.map((f) => {
          const on = filter === f.k;
          return (
            <Pressable
              key={f.k}
              label={`${f.l}, ${counts[f.k]}`}
              pressed={on}
              onClick={() => local.onFilter(f.k)}
              className={cx('vu-chip', on ? 'is-on' : '')}
              style={s(
                'flex:none;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;padding:8px 14px;border-radius:999px;cursor:pointer;transition:background .16s ease, border-color .16s ease, color .16s ease',
                `border:1px solid ${on ? C.ink : C.line2}`,
                `background:${on ? C.ink : '#fff'}`,
                `font:500 14px/1.1 ${F.body}`,
                `color:${on ? '#fff' : C.ink}`
              )}
            >
              {f.l}
              <span style={S(`font:500 13px/1 ${F.body};font-variant-numeric:tabular-nums;color:${on ? 'rgba(255,255,255,.72)' : C.ink3}`)}>{counts[f.k]}</span>
            </Pressable>
          );
        })}
      </div>

      {rows.length ? (
        <ul className="vu-list" style={S('margin:16px 0 0;padding:0;list-style:none')}>
          {rows.map((e) => (e.kind === 'cross' ? (
            <CrossRow key={e.key} app={e.a} busy={busy === e.a.id} onDecide={onDecide} onRevert={onRevert} />
          ) : (
            <LocalRow key={e.key} a={e.a} local={local} />
          )))}
        </ul>
      ) : local.renderEmpty ? (
        <div style={S('margin-top:16px')}>{local.renderEmpty(filter)}</div>
      ) : null}
    </section>
  );
}

function CrossRow({ app, busy, onDecide, onRevert }) {
  const st = LIST_STATUS[app.status];
  return (
    <Row listed name={app.applicant_name} facts={factsFor(app, true)} note={app.note} status={st} message={<MessageButton app={app} />}>
      {app.status === 'pending' ? (
        <PendingActions
          name={app.applicant_name}
          busy={busy}
          onAccept={() => onDecide(app, 'accepted')}
          onWaitlist={() => onDecide(app, 'waitlisted')}
          onDecline={() => onDecide(app, 'declined')}
        />
      ) : app.status === 'withdrawn' ? null : app.status === 'waitlisted' ? (
        // A spot opened: accept straight from the waitlist.
        <>
          <Button variant="dark" size="sm" onClick={() => onDecide(app, 'accepted')} disabled={busy} aria-label={`Accept ${app.applicant_name} from the waitlist`}>Accept</Button>
          <UndoButton name={app.applicant_name} busy={busy} onClick={() => onRevert(app)} />
        </>
      ) : (
        <UndoButton name={app.applicant_name} busy={busy} onClick={() => onRevert(app)} />
      )}
    </Row>
  );
}

function LocalRow({ a, local }) {
  const st = LIST_STATUS[a.status];
  const answers = local.onAnswers && a.answers && a.answers.length ? () => local.onAnswers(a) : null;
  const extra = (a.flags || []).length || answers ? (
    <span style={S('margin-top:8px;display:flex;align-items:center;gap:6px 16px;flex-wrap:wrap')}>
      {(a.flags || []).map((f) => <StatusText key={f} tone="wait">{f}</StatusText>)}
      {answers ? (
        <button type="button" onClick={answers} aria-label={`Read ${a.n}'s answers`} className={cx('vu-link', H.press)} style={S(ANSWERS_LINK)}>
          Read their answers
        </button>
      ) : null}
    </span>
  ) : null;
  return (
    <Row listed name={a.n} facts={[a.s, a.role, a.when ? `Applied ${a.when}` : ''].filter(Boolean)} note={a.note} status={st} extra={extra}>
      {a.status === 'pending' ? (
        <PendingActions
          name={a.n}
          onAccept={() => local.onDecide(a, 'accepted')}
          onWaitlist={() => local.onDecide(a, 'waitlisted')}
          onDecline={() => local.onDecide(a, 'declined')}
        />
      ) : a.status === 'waitlisted' ? (
        <>
          <Button variant="dark" size="sm" onClick={() => local.onDecide(a, 'accepted')} aria-label={`Accept ${a.n} from the waitlist`}>Accept</Button>
          <UndoButton name={a.n} onClick={() => local.onUndo(a)} />
        </>
      ) : (
        <UndoButton name={a.n} onClick={() => local.onUndo(a)} />
      )}
    </Row>
  );
}

/* ---- shared row pieces ------------------------------------------------- */

/* Accept is the one filled button; Waitlist and Decline are underlined text. */
function PendingActions({ name, busy = false, onAccept, onWaitlist, onDecline }) {
  return (
    <>
      <Button variant="dark" size="sm" onClick={onAccept} disabled={busy} aria-label={`Accept ${name}`}>Accept</Button>
      {onWaitlist ? (
        <Button variant="ghost" size="sm" onClick={onWaitlist} disabled={busy} aria-label={`Waitlist ${name}`}>Waitlist</Button>
      ) : null}
      <Button variant="ghost" size="sm" onClick={onDecline} disabled={busy} aria-label={`Decline ${name}`}>Decline</Button>
    </>
  );
}

function UndoButton({ name, busy = false, onClick }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={busy} aria-label={`Undo the decision for ${name}`}>Undo</Button>
  );
}

/* One application: neutral avatar, name and what they applied for (their note
   under it in plain quotes), then the status word and the row's actions.
   `listed` rows (the combined list) use the fixed trailing column and always
   end in the message slot, empty when there is no thread to open. */
function Row({ name, facts, note, status, extra = null, listed = false, message = null, children }) {
  return (
    <li>
      <div className={cx('vu-row', listed ? 'vu-apps-row' : '')} style={S('align-items:start')}>
        <span className="vu-row-avatar">
          <Avatar name={name} fs={13} />
        </span>
        <div style={S('min-width:0')}>
          <span className="vu-row-t vu-break" style={S('white-space:normal')}>{name}</span>
          {facts.length ? (
            <span className="vu-row-m vu-row-m--wrap">
              {facts.map((f, i) => (
                <span key={i}>
                  {i ? <Sep /> : null}
                  {f}
                </span>
              ))}
            </span>
          ) : null}
          {note ? <span className="vu-row-m vu-row-m--wrap vu-break" style={S('margin-top:4px')}>“{note}”</span> : null}
          {extra}
        </div>
        <div className={cx('vu-row-end', listed ? 'vu-apps-end' : '')} style={S('align-self:center')}>
          {status ? <StatusText tone={status.tone}>{status.l}</StatusText> : null}
          {children}
          {listed ? message || <span className="vu-apps-msg" aria-hidden="true" /> : null}
        </div>
      </div>
    </li>
  );
}
