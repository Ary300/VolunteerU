'use client';

/* ==========================================================================
   CrossMembers.jsx, people who joined THROUGH the app (cross-user)
   These aren't local roster rows; they're other-account volunteers who
   applied to your public link and were accepted. The lead assigns each one a
   role and tasks here; the assignment is written to that person's application
   row and shows up on their own home screen. Their progress flows back through
   member_state. Lead-authoritative, member-reports, the guard trigger keeps
   the two halves from overwriting each other.
   ========================================================================== */

import { useEffect, useState, useCallback } from 'react';
import { S, s, cx, H } from '../../lib/style.js';
import Link from 'next/link';
import { Pressable, Field, Select, TextArea, EmptyState, Avatar, Icon, Button, StatusText, IconButton } from '../ui.jsx';
import { C, F, R } from '../../lib/tokens.js';
import { openModal, toast, menuFromEvent } from '../../lib/overlays.js';
import { copyText } from '../../lib/db.js';
import { loadProjectMembers, setMemberAssignment, confirmMemberHour, checkInCodeMatches } from '../../lib/listings.js';
import MessageThread from '../MessageThread.jsx';

const H2 = `margin:0;font:650 22px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`;
const META = `font:400 14px/1.4 ${F.body};color:${C.ink2}`;
const SMALL = `font:400 13px/1.45 ${F.body};color:${C.ink2}`;
const NUM = 'font-variant-numeric:tabular-nums';
const RULE = `border-bottom:1px solid ${C.line}`;
/** Outline row action (Message, Rate, Copy link, Add a task). */
const OUTLINE_BTN = `display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:none;padding:0 12px;height:36px;border-radius:${R.control};border:1px solid ${C.line2};background:#fff;font:600 13px/1 ${F.body};color:${C.ink};cursor:pointer;white-space:nowrap`;
const OUTLINE_CLS = cx('vu-btn', 'vu-btn-outline', H.press);

const RELIABILITY = ['', 'Needs support', 'Developing', 'Solid', 'Strong', 'Exceptional'];

/** Only http(s) links are rendered as clickable; anything else returns null. */
export function safeLink(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

function fmtHrs(n) {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function hrsLabel(n) {
  const v = fmtHrs(n);
  return `${v} ${v === '1' ? 'hr' : 'hrs'}`;
}

/** Open a rating modal for one cross-user member. The rating writes to the
    application's owner-side assignment, so it lands on the volunteer's account. */
export function openRating(app, onSaved) {
  openModal({
    title: `Rate ${app.applicant_name}`,
    subtitle: 'They see this rating and your note on their profile.',
    Body: ({ api }) => <RatingForm api={api} app={app} onSaved={onSaved} />,
  });
}

function RatingForm({ api, app, onSaved }) {
  const cur = (app.assignment && app.assignment.rating) || {};
  const [stars, setStars] = useState(cur.stars || 0);
  const [note, setNote] = useState(cur.note || '');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!stars || busy) return;
    setBusy(true);
    const rating = { stars, reliability: RELIABILITY[stars], note: note.trim(), ratedAt: new Date().toISOString() };
    const { ok } = await setMemberAssignment(app.id, { rating });
    setBusy(false);
    if (ok) { api.close(); toast({ title: 'Rating saved', message: `${app.applicant_name}, ${stars} out of 5`, tone: 'ok' }); onSaved && onSaved(); }
    else toast({ title: "Couldn't save the rating", message: 'Check your connection and try again.', tone: 'danger' });
  }
  return (
    <div>
      <div role="radiogroup" aria-label="Rating" style={S('display:flex;gap:4px')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            role="radio"
            aria-checked={stars === n}
            label={`${n} out of 5`}
            onClick={() => setStars(n)}
            className={cx(H.press)}
            style={S(`display:grid;place-items:center;width:44px;height:44px;border-radius:${R.control};cursor:pointer;color:${n <= stars ? C.ember : C.line2}`)}
          >
            <Icon name="star" size={28} filled={n <= stars} />
          </Pressable>
        ))}
      </div>
      <div aria-live="polite" style={S(`margin-top:8px;font:500 14px/1.2 ${F.body};color:${C.ink2}`)}>{stars ? `${stars} out of 5, ${RELIABILITY[stars]}` : 'Pick 1 to 5 stars'}</div>
      <div style={S('margin-top:16px')}>
        <TextArea label="Feedback (optional)" value={note} onChange={setNote} maxLength={280} minHeight={70} placeholder="e.g. Showed up early and helped set up" />
      </div>
      <div style={S('margin-top:20px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Button variant="outline" onClick={() => api.close()}>Cancel</Button>
        <Pressable label="Save rating" disabled={busy || !stars} onClick={save} className={cx('vu-btn', 'vu-btn-primary', H.press)} style={s(`display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 18px;border-radius:${R.control};border:1px solid ${C.ember};background:${C.ember};color:#fff;font:600 15px/1 ${F.body};cursor:pointer`, !stars ? 'opacity:.45;cursor:default' : '')}>{busy ? 'Saving' : 'Save rating'}</Pressable>
      </div>
    </div>
  );
}

function RateButton({ app, onSaved }) {
  const stars = app.assignment && app.assignment.rating && app.assignment.rating.stars;
  return (
    <Pressable label={stars ? `Rated ${stars} out of 5, change rating for ${app.applicant_name}` : `Rate ${app.applicant_name}`} onClick={() => openRating(app, onSaved)} className={OUTLINE_CLS} style={S(OUTLINE_BTN)}>
      {stars ? (
        <>
          <Icon name="star" size={14} filled color={C.ember} />
          {stars} of 5
        </>
      ) : 'Rate'}
    </Pressable>
  );
}

/** Opens the in-app thread with one accepted member, the same thread the
    volunteer reaches from "Message organizer". */
function MessageButton({ app, p }) {
  function open() {
    openModal({
      title: app.applicant_name,
      subtitle: p.name ? `About ${p.name}` : 'Member',
      Body: () => <MessageThread applicationId={app.id} recipientId={app.applicant_id} recipientName={app.applicant_name} />,
    });
  }
  return (
    <Pressable label={`Message ${app.applicant_name}`} title={`Message ${app.applicant_name}`} onClick={open} className={cx('vu-iconbtn-sm', H.press)} style={S('width:36px;height:36px;cursor:pointer')}>
      <Icon name="message" size={18} />
    </Pressable>
  );
}

/** The member's latest check-in, or nothing when they haven't checked in.
    The volunteer's side can't see the project's code, so the comparison
    happens here: a wrong or missing code is flagged for the lead instead of
    reading as a clean check-in. */
function LastCheckIn({ app, p }) {
  const last = ((app.member_state && app.member_state.checkins) || [])[0];
  if (!last) return null;
  // "for Sat, Oct 17 at noon-6 PM" already says the day; don't repeat it.
  const sameDay = last.at && last.session && String(last.session).startsWith(last.at);
  const when = sameDay ? '' : last.at && last.at !== 'Today' ? ` on ${last.at}` : ', today';
  const match = p && p.checkinCode ? checkInCodeMatches(last, p.checkinCode) : true;
  const line = `Checked in${last.session ? ` for ${last.session}` : ''}${when}`;
  if (match === true) {
    return (
      <div style={S(`margin-top:6px;display:inline-flex;align-items:center;gap:6px;font:500 13px/1.4 ${F.body};color:${C.confirmed}`)}>
        <Icon name="check" size={13} />
        <span>{line}</span>
      </div>
    );
  }
  const flag = match === false ? `Code ${last.code} doesn't match your check-in code` : 'No check-in code entered';
  return (
    <div style={S(`margin-top:6px;display:flex;align-items:flex-start;gap:6px;font:500 13px/1.4 ${F.body};color:${C.waiting}`)}>
      <span style={S('flex:none;margin-top:1px')}><Icon name="alert" size={13} /></span>
      <span>
        {line}
        <span style={S('display:block;font-weight:600')}>{flag}</span>
      </span>
    </div>
  );
}

function joinLink(p) {
  if (!p.listingId) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/join/${p.listingId}`;
}

function newTaskId() {
  return `mt-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function useMembers(p) {
  const [members, setMembers] = useState(null);
  const load = useCallback(() => {
    loadProjectMembers(p.listingId)
      .then(setMembers)
      .catch((err) => {
        console.error('[lead] could not load members', err);
        setMembers([]);
      });
  }, [p.listingId]);
  useEffect(() => { load(); }, [load]);
  // Members tick tasks and log hours from their own accounts. Pick that up
  // when the lead comes back to this tab instead of asking them to refresh.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);
  return [members, load, setMembers];
}

/** The project's join link as one plain line with a Copy button, reused
    across both org types. No fill: it sits between the heading and the list.
    Callers may still pass the old `tone` prop; it no longer changes anything. */
export function ShareLink({ p }) {
  const link = joinLink(p);
  async function copy() {
    if (!link || p.archived) return;
    const ok = await copyText(link);
    toast(ok ? { title: 'Join link copied', message: 'Anyone with the link can see this project and apply.', tone: 'ok' } : { title: 'Copy this link', message: link, tone: 'warn' });
  }
  const note = (t) => <p style={S(`margin:0;${META}`)}>{t}</p>;
  if (!link) return note('Your join link turns on once this project is published.');
  if (p.archived) return note("This project is archived, so its join link doesn't take applications.");
  return (
    <div style={S('display:flex;align-items:center;gap:12px;flex-wrap:wrap')}>
      <div style={S('min-width:0;flex:1 1 240px')}>
        <div style={S(`font:600 14px/1.3 ${F.body};color:${C.ink}`)}>Your join link</div>
        <div className="vu-trunc" style={S(`margin-top:2px;${SMALL}`)}>{link}</div>
      </div>
      <Pressable label="Copy join link" onClick={copy} className={OUTLINE_CLS} style={S(OUTLINE_BTN)}>
        <Icon name="copy" size={14} />
        Copy link
      </Pressable>
    </div>
  );
}

/* A member's logged hours, with a Confirm toggle. Confirmed hours count on the
   volunteer's profile. Shared by the team + pipeline managers. */
function MemberHoursConfirm({ app, onDone }) {
  const log = (app.member_state && app.member_state.hoursLog) || [];
  const confirmed = (app.assignment && app.assignment.confirmedHours) || {};
  const [busy, setBusy] = useState(null);
  if (!log.length) return null;
  const done = log.filter((h) => confirmed[h.id]).reduce((a, h) => a + Number(h.hrs || 0), 0);
  const waiting = log.filter((h) => !confirmed[h.id]).reduce((a, h) => a + Number(h.hrs || 0), 0);
  async function toggle(h) {
    if (busy) return;
    const was = !!confirmed[h.id];
    setBusy(h.id);
    const { ok } = await confirmMemberHour(app.id, h.id, !was);
    setBusy(null);
    if (ok) {
      // The Hours badge and Overview count these; tell them to reload.
      window.dispatchEvent(new Event('vu:applications-changed'));
      toast({ title: was ? 'Confirmation removed' : 'Hours confirmed', message: `${hrsLabel(h.hrs)} for ${app.applicant_name}`, tone: 'ok', timeout: 2000 });
      onDone && onDone();
    } else toast({ title: "Couldn't save that", message: 'Check your connection and try again.', tone: 'danger' });
  }
  return (
    <div style={S('margin-top:14px;padding-left:min(52px, max(0px, calc(100vw - 720px)))')} className="vu-lead-hours">
      <div style={S('display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap')}>
        <div style={S(`font:600 14px/1.2 ${F.body};color:${C.ink}`)}>Logged hours</div>
        <div style={S(`display:flex;align-items:center;gap:14px;flex-wrap:wrap;${NUM}`)}>
          <StatusText tone="ok">{hrsLabel(done)} confirmed</StatusText>
          {waiting > 0 ? <StatusText tone="wait">{hrsLabel(waiting)} waiting</StatusText> : null}
        </div>
      </div>
      <ul style={S('margin:6px 0 0;padding:0;list-style:none')}>
        {log.map((h) => {
          const on = !!confirmed[h.id];
          const working = busy === h.id;
          return (
            <li key={h.id} style={S(`border-top:1px solid ${C.line}`)}>
              <div style={S('display:flex;align-items:center;gap:12px;min-height:48px;padding:6px 0;flex-wrap:wrap')}>
              <span style={S(`font:400 14px/1.35 ${F.body};flex:1;min-width:140px;color:${C.ink}`)}>
                {h.activity}
                {h.date ? <span style={S(`color:${C.ink2}`)}>, {h.date}</span> : null}
              </span>
              <span style={S(`font:600 14px/1 ${F.body};color:${C.ink};${NUM}`)}>{hrsLabel(h.hrs)}</span>
              {on ? (
                <span style={S('flex:none;display:inline-flex;align-items:center;gap:10px')}>
                  <StatusText tone="ok">{working ? 'Removing' : 'Confirmed'}</StatusText>
                  <Pressable
                    label={`Remove confirmation for ${h.activity}`}
                    disabled={working}
                    onClick={() => toggle(h)}
                    className={cx('vu-link', H.press)}
                    style={s(`flex:none;display:inline-flex;align-items:center;padding:0 4px;height:36px;border:0;background:none;font:600 13px/1 ${F.body};color:${C.ink};text-decoration:underline;text-underline-offset:3px;cursor:pointer`, working ? 'opacity:.6' : '')}
                  >
                    Undo
                  </Pressable>
                </span>
              ) : (
                <Pressable
                  label={`Confirm ${hrsLabel(h.hrs)} for ${h.activity}`}
                  disabled={working}
                  onClick={() => toggle(h)}
                  className={cx('vu-btn', 'vu-btn-dark', H.press)}
                  style={s(`flex:none;display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:36px;border-radius:${R.control};font:600 13px/1 ${F.body};cursor:pointer;background:${C.ink};border:1px solid ${C.ink};color:#fff`, working ? 'opacity:.6' : '')}
                >
                  <Icon name="check" size={14} stroke={2} />
                  {working ? 'Confirming' : 'Confirm'}
                </Pressable>
              )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------- team: assign role + tasks to online members -------------------- */

export function TeamMembersManager({ p }) {
  const [members, reload] = useMembers(p);
  const roles = (p.taskBoard && p.taskBoard.roles) || [];

  function assignRole(app, roleId) {
    const role = roles.find((r) => r.id === roleId);
    setMemberAssignment(app.id, { role: role ? { id: role.id, name: role.name, briefing: role.briefing, color: role.color } : null })
      .catch((error) => ({ ok: false, error }))
      .then((res) => {
        if (res.ok) {
          // Role rows on the Tasks tab count link members by this role; tell them to reload.
          window.dispatchEvent(new Event('vu:applications-changed'));
          toast({ title: role ? 'Role saved' : 'Role cleared', message: role ? `${app.applicant_name} is now ${role.name}` : app.applicant_name, tone: 'ok', timeout: 2000 });
          reload();
        } else {
          console.error('[lead] could not save member role', res.error);
          toast({ title: "Couldn't save the role", message: 'Check your connection and try again.', tone: 'danger' });
        }
      });
  }

  function editTasks(app) {
    openModal({
      title: `Tasks for ${app.applicant_name}`,
      subtitle: 'They see these on their home screen and mark them done.',
      Body: ({ api }) => <MemberTaskForm api={api} app={app} onSaved={reload} />,
    });
  }

  return (
    <section aria-labelledby="tm-members">
      <h2 id="tm-members" style={S(H2)}>Members from your join link</h2>
      <p style={S(`margin:6px 0 0;${META}`)}>People you accepted through your join link. Give each one a role and tasks.</p>

      <div style={S('margin-top:16px')}><ShareLink p={p} /></div>

      {members === null ? (
        <div role="status" style={S(`margin-top:16px;${SMALL}`)}>Loading members</div>
      ) : members.length === 0 ? (
        <EmptyState compact icon="users" title="No members from your link yet" body="Accept an application from your join link and they show up here." />
      ) : (
        <div style={S(`margin-top:16px;display:flex;flex-direction:column;border-top:1px solid ${C.line}`)}>
          {members.map((app) => {
            const a = app.assignment || {};
            const tasks = a.tasks || [];
            const done = (app.member_state && app.member_state.tasks) || {};
            const doneCount = tasks.filter((t) => done[t.id] === 'done').length;
            const acked = a.role && app.member_state && app.member_state.briefingAck && app.member_state.briefingAck[a.role.id];
            return (
              <div key={app.id} style={S(`padding:18px 0;${RULE}`)}>
                <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:16px')}>
                  <div style={S('display:flex;align-items:center;gap:12px;min-width:0')}>
                    <span className="vu-row-avatar">
                      <Avatar name={app.applicant_name} fs={13} />
                    </span>
                    <div style={S('min-width:0')}>
                      <div style={S(`font:600 15px/1.25 ${F.body};color:${C.ink}`)}>{app.applicant_name}</div>
                      <div style={S(`margin-top:3px;${SMALL}`)}>
                        {app.position ? `Applied as ${app.position}` : app.assignment && app.assignment.inviteId ? 'Joined with your invite link' : 'Applied on VolunteerU'}
                        {a.role ? (acked ? ', read their briefing' : ", hasn't read their briefing") : ''}
                      </div>
                      <LastCheckIn app={app} p={p} />
                    </div>
                  </div>
                  <div style={S('display:flex;align-items:center;gap:8px;flex:none;flex-wrap:wrap')}>
                    <div style={S('flex:1 1 160px;min-width:160px')}>
                      <Select
                        label=""
                        ariaLabel={`Role for ${app.applicant_name}`}
                        value={a.role ? a.role.id : ''}
                        options={[{ v: '', l: 'No role yet' }, ...roles.map((r) => ({ v: r.id, l: r.name }))]}
                        onChange={(v) => assignRole(app, v)}
                        bg="#fff"
                        fs={14}
                      />
                    </div>
                    {/* One group, so the buttons wrap together under the role picker. */}
                    <div style={S('display:flex;align-items:center;gap:8px;flex:none')}>
                      <Pressable label={`Tasks for ${app.applicant_name}`} onClick={() => editTasks(app)} className={OUTLINE_CLS} style={S(OUTLINE_BTN)}>
                        <Icon name="list" size={14} />
                        {tasks.length ? `Tasks (${doneCount} of ${tasks.length} done)` : 'Add tasks'}
                      </Pressable>
                      <RateButton app={app} onSaved={reload} />
                      <MessageButton app={app} p={p} />
                    </div>
                  </div>
                </div>
                {tasks.length ? (
                  <ul style={S('margin:12px 0 0;padding:0 0 0 min(52px, max(0px, calc(100vw - 720px)));list-style:none')}>
                    {tasks.map((t) => {
                      const st = done[t.id] === 'done';
                      return (
                        <li key={t.id} style={S(`display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid ${C.line}`)}>
                          <span aria-hidden="true" style={s('width:18px;height:18px;border-radius:50%;flex:none;display:grid;place-items:center', st ? `background:${C.confirmed};color:#fff` : `background:#fff;border:1.5px solid ${C.line2}`)}>
                            {st ? <Icon name="check" size={12} stroke={2.5} /> : null}
                          </span>
                          <span style={s(`font:400 14px/1.35 ${F.body};flex:1;min-width:0`, st ? `color:${C.ink2}` : `color:${C.ink}`)}>{t.title}</span>
                          <span style={s(`font:600 13px/1 ${F.body};flex:none`, st ? `color:${C.confirmed}` : `color:${C.ink2}`)}>{st ? 'Done' : 'To do'}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                <MemberHoursConfirm app={app} onDone={reload} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MemberTaskForm({ api, app, onSaved }) {
  const [tasks, setTasks] = useState(() => ((app.assignment && app.assignment.tasks) || []).map((t) => ({ ...t })));
  const [busy, setBusy] = useState(false);
  const done = (app.member_state && app.member_state.tasks) || {};
  const add = () => setTasks((ts) => [...ts, { id: newTaskId(), title: '', detail: '' }]);
  const setT = (i, patch) => setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const remove = (i) => setTasks((ts) => ts.filter((_, j) => j !== i));

  async function save() {
    if (busy) return;
    setBusy(true);
    const clean = tasks.filter((t) => t.title && t.title.trim()).map((t) => ({ id: t.id, title: t.title.trim(), detail: (t.detail || '').trim() }));
    const { ok } = await setMemberAssignment(app.id, { tasks: clean });
    setBusy(false);
    if (ok) { api.close(); toast({ title: 'Tasks saved', message: `${clean.length} for ${app.applicant_name}`, tone: 'ok' }); onSaved && onSaved(); }
    else toast({ title: "Couldn't save the tasks", message: 'Check your connection and try again.', tone: 'danger' });
  }

  return (
    <div>
      <div style={S('display:flex;flex-direction:column;gap:10px')}>
        {tasks.map((t, i) => (
          <div key={t.id} style={S(`padding:12px 0;border-bottom:1px solid ${C.line}`)}>
            <div style={S('display:flex;align-items:center;gap:10px')}>
              <div style={S('flex:1;min-width:0')}>
                <Field label="" ariaLabel={`Task ${i + 1} title`} value={t.title} onChange={(v) => setT(i, { title: v })} placeholder="e.g. Pick up the trash grabbers" bg="#fff" fs={14} maxLength={90} />
              </div>
              {done[t.id] === 'done' ? (
                <span style={S(`display:inline-flex;align-items:center;gap:4px;font:600 13px/1 ${F.body};color:${C.confirmed};flex:none`)}>
                  <Icon name="check" size={12} />
                  Done
                </span>
              ) : null}
              <Pressable label={`Remove task ${i + 1}`} onClick={() => remove(i)} className={cx('vu-iconbtn-sm', H.press)} style={S('width:40px;height:40px;cursor:pointer')}>
                <Icon name="trash" size={18} />
              </Pressable>
            </div>
            <div style={S('margin-top:8px')}>
              <Field label="" ariaLabel={`Task ${i + 1} detail`} value={t.detail} onChange={(v) => setT(i, { detail: v })} placeholder="Detail (optional)" bg="#fff" fs={13} maxLength={160} />
            </div>
          </div>
        ))}
        {!tasks.length ? <p style={S(`margin:0;${META}`)}>No tasks yet. Add the first thing you want them to do.</p> : null}
      </div>
      <Pressable label="Add a task" onClick={add} className={OUTLINE_CLS} style={S(`margin-top:12px;${OUTLINE_BTN}`)}>
        <Icon name="plus" size={14} />
        Add a task
      </Pressable>
      <div style={S('margin-top:20px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Button variant="outline" onClick={() => api.close()}>Cancel</Button>
        <Button variant="primary" busy={busy} onClick={save} aria-label="Save tasks">{busy ? 'Saving' : 'Save tasks'}</Button>
      </div>
    </div>
  );
}

/* -------- volunteering: one row pattern for "person + their steps" -------- */

/** One setup step as a pill. With `onToggle` it's a checkbox the lead flips
    (roster people). Without it, it shows the same pill read-only: join-link
    members tick their own steps from their account, so the lead only sees them. */
export function StepPill({ label, done, who, onToggle }) {
  const base = `display:inline-flex;align-items:center;gap:8px;padding:0 14px 0 10px;min-height:36px;border-radius:${R.pill};font:500 14px/1.2 ${F.body};transition:background .16s ease, border-color .16s ease`;
  const tone = done ? `background:${C.confirmedTint};border:1px solid ${C.confirmedTint};color:${C.confirmed}` : `background:#fff;border:1px solid ${C.line2};color:${C.ink}`;
  const mark = (
    <span aria-hidden="true" style={s('width:18px;height:18px;border-radius:50%;flex:none;display:grid;place-items:center', done ? `background:${C.confirmed};color:#fff` : `background:#fff;border:1.5px solid ${C.line2}`)}>
      {done ? <Icon name="check" size={12} stroke={2.5} /> : null}
    </span>
  );
  if (!onToggle) {
    return (
      <span title={`${who} marks this step themselves`} style={s(base, tone)}>
        {mark}
        {label}
        <span className="vu-sr">{done ? ', done' : ', not done'}</span>
      </span>
    );
  }
  return (
    <Pressable
      role="checkbox"
      aria-checked={!!done}
      label={`${label} for ${who}`}
      onClick={onToggle}
      className={cx(done ? '' : H.chip, H.press)}
      style={s(base, tone, 'cursor:pointer')}
    >
      {mark}
      {label}
    </Pressable>
  );
}

/** A person and their steps: Avatar, name, "1 of 2 done", then the pills.
    Roster people and join-link members share it, so the tab reads as one list.
    `extra` sits under the status (a check-in flag); `end` is the row's menu. */
export function ProgressRow({ name, ready, cleared, total, steps, onToggle, extra, end }) {
  return (
    <li style={S(`padding:14px 0;${RULE}`)}>
      <div className={cx('vu-pl-row', end ? 'has-end' : '')}>
        <div className="vu-pl-who" style={S('display:flex;align-items:center;gap:12px;min-width:0')}>
          <span className="vu-row-avatar">
            <Avatar name={name} fs={13} />
          </span>
          <div style={S('min-width:0')}>
            <div className="vu-trunc" style={S(`font:600 15px/1.25 ${F.body};color:${C.ink}`)}>{name}</div>
            <div style={S('margin-top:5px')}>
              <StatusText tone={ready ? 'ok' : 'wait'}>{ready ? 'Ready for shifts' : `${cleared} of ${total} done`}</StatusText>
            </div>
            {extra}
          </div>
        </div>
        <div className="vu-pl-steps" style={S('display:flex;gap:8px;flex-wrap:wrap;min-width:0')}>
          {steps.map((step) => (
            <StepPill key={step.id} label={step.label} done={!!step.done} who={name} onToggle={onToggle ? () => onToggle(step) : null} />
          ))}
        </div>
        {end ? <div className="vu-pl-end">{end}</div> : null}
      </div>
    </li>
  );
}

/** Rate and Message for one join-link member, behind one more button. */
function MemberMenu({ app, p, onSaved }) {
  const stars = app.assignment && app.assignment.rating && app.assignment.rating.stars;
  function message() {
    openModal({
      title: app.applicant_name,
      subtitle: p.name ? `About ${p.name}` : 'Member',
      Body: () => <MessageThread applicationId={app.id} recipientId={app.applicant_id} recipientName={app.applicant_name} />,
    });
  }
  return (
    <IconButton
      icon="more"
      label={`More actions for ${app.applicant_name || "Volunteer"}`}
      aria-haspopup="menu"
      onClick={(e) =>
        menuFromEvent(
          e,
          [
            { key: 'rate', label: stars ? `Change rating (${stars} of 5)` : 'Rate', icon: 'star' },
            { key: 'message', label: 'Message', icon: 'message' },
          ],
          (key) => {
            if (key === 'rate') openRating(app, onSaved);
            else if (key === 'message') message();
          }
        )
      }
    />
  );
}

/* -------- volunteering: online members' progress through the steps ------- */

export function PipelineMembers({ p }) {
  const [members, reload] = useMembers(p);
  const steps = (p.pipeline || []).filter((x) => x && x.label);

  if (members === null) return null;

  return (
    <section aria-labelledby="pl-members">
      <h2 id="pl-members" style={S(H2)}>Members from your join link</h2>
      <p style={S(`margin:6px 0 0;${META}`)}>
        People you accepted through your join link. They mark their own steps done. Confirm the hours they log on the{' '}
        <Link href={`/lead/${p.id}/hours`} className={cx('vu-link', H.link)} style={S(`color:${C.ink};font-weight:600;text-decoration:underline;text-underline-offset:3px`)}>Hours tab</Link>.
      </p>
      <div style={S('margin-top:16px')}><ShareLink p={p} /></div>
      {members.length === 0 ? (
        <EmptyState compact icon="users" title="No members from your link yet" body="People you accept through your join link show up here with their progress." />
      ) : (
        <ul style={S(`margin:16px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
          {members.map((app) => {
            const doneMap = (app.member_state && app.member_state.pipeline) || {};
            const required = steps.filter((x) => x.required !== false);
            const cleared = required.filter((x) => doneMap[x.id]).length;
            return (
              <ProgressRow
                key={app.id}
                name={app.applicant_name || 'Volunteer'}
                ready={required.length === 0 || cleared === required.length}
                cleared={cleared}
                total={required.length}
                steps={steps.map((x) => ({ id: x.id, label: x.label, done: !!doneMap[x.id] }))}
                extra={<LastCheckIn app={app} p={p} />}
                end={<MemberMenu app={app} p={p} onSaved={reload} />}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
