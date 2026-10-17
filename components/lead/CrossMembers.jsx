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
import { Pressable, Field, Select, TextArea, EmptyState, Avatar, Icon } from '../ui.jsx';
import { openModal, toast } from '../../lib/overlays.js';
import { copyText } from '../../lib/db.js';
import { loadProjectMembers, setMemberAssignment, confirmMemberHour, checkInCodeMatches } from '../../lib/listings.js';
import MessageThread from '../MessageThread.jsx';

const MONO = "'Geist Mono',monospace";
const LABEL = 'font:600 14px/1.2 Geist;color:#1A1714';
const MODAL_PRIMARY = 'display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;cursor:pointer';
const MODAL_SECONDARY = 'display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#1A1714;cursor:pointer';
const OUTLINE_BTN = 'display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:none;padding:0 12px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#A8482A;cursor:pointer';

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
            style={S(`display:grid;place-items:center;width:42px;height:42px;border-radius:10px;cursor:pointer;color:${n <= stars ? '#C2603C' : '#D8CFC5'}`)}
          >
            <Icon name="star" size={28} filled={n <= stars} />
          </Pressable>
        ))}
      </div>
      <div aria-live="polite" style={S('margin-top:8px;font:500 13px/1 Geist;color:#57504A')}>{stars ? `${stars} out of 5, ${RELIABILITY[stars]}` : 'Pick 1 to 5 stars'}</div>
      <div style={S('margin-top:16px')}>
        <TextArea label="Feedback (optional)" value={note} onChange={setNote} maxLength={280} minHeight={70} placeholder="e.g. Showed up early and helped set up" />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>Cancel</Pressable>
        <Pressable label="Save rating" disabled={busy || !stars} onClick={save} className={cx(H.primary, H.press)} style={s(MODAL_PRIMARY, !stars ? 'opacity:.5;cursor:default' : '')}>{busy ? 'Saving' : 'Save rating'}</Pressable>
      </div>
    </div>
  );
}

function RateButton({ app, onSaved }) {
  const stars = app.assignment && app.assignment.rating && app.assignment.rating.stars;
  return (
    <Pressable label={stars ? `Rated ${stars} out of 5, change rating for ${app.applicant_name}` : `Rate ${app.applicant_name}`} onClick={() => openRating(app, onSaved)} className={cx(H.secondary, H.press)} style={S(OUTLINE_BTN)}>
      {stars ? (
        <>
          <Icon name="star" size={14} filled />
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
    <Pressable label={`Message ${app.applicant_name}`} onClick={open} className={cx(H.secondary, H.press)} style={S(OUTLINE_BTN)}>
      <Icon name="message" size={14} />
      Message
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
      <div style={S('margin-top:6px;display:inline-flex;align-items:center;gap:6px;font:450 12px/1.4 Geist;color:#3F6B4E')}>
        <Icon name="check" size={13} />
        <span>{line}</span>
      </div>
    );
  }
  const flag = match === false ? `Code ${last.code} doesn't match your check-in code` : 'No check-in code entered';
  return (
    <div style={S('margin-top:6px;display:flex;align-items:flex-start;gap:6px;font:450 12px/1.4 Geist;color:#8A5A20')}>
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
  return [members, load, setMembers];
}

/** Small share-your-link banner, reused across both org types. */
export function ShareLink({ p, tone = 'soft' }) {
  const link = joinLink(p);
  const bg = tone === 'soft' ? '#FAF6F3' : '#fff';
  async function copy() {
    if (!link || p.archived) return;
    const ok = await copyText(link);
    toast(ok ? { title: 'Join link copied', message: 'Anyone with the link can see this project and apply.', tone: 'ok' } : { title: 'Copy this link', message: link, tone: 'warn' });
  }
  if (!link) {
    return (
      <div style={s('padding:14px 16px;border-radius:12px;border:1px solid #EFE3DC;font:450 13px/1.5 Geist;color:#8A5A20', `background:${bg}`)}>
        Your join link turns on once this project is published.
      </div>
    );
  }
  if (p.archived) {
    return (
      <div style={s('padding:14px 16px;border-radius:12px;border:1px solid #EFE3DC;font:450 13px/1.5 Geist;color:#8A5A20', `background:${bg}`)}>
        This project is archived, so its join link doesn't take applications.
      </div>
    );
  }
  return (
    <div style={s('padding:14px 16px;border-radius:12px;border:1px solid #EFE3DC;display:flex;align-items:center;gap:12px;flex-wrap:wrap', `background:${bg}`)}>
      <div style={S('min-width:0;flex:1')}>
        <div style={S('font:500 13px/1.2 Geist;color:#57504A')}>Your join link</div>
        <div className="vu-trunc" style={S('margin-top:5px;font:450 13px/1.3 Geist;color:#332D28')}>{link}</div>
      </div>
      <Pressable label="Copy join link" onClick={copy} className={cx(H.secondary, H.press)} style={S(OUTLINE_BTN)}>
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
    <div style={S('margin-top:12px')}>
      <div style={S('display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap')}>
        <div style={S('font:500 13px/1.2 Geist;color:#57504A')}>Logged hours</div>
        <div style={S('font:450 12px/1.2 Geist;color:#6B635C')}>
          <span style={S('color:#3F6B4E')}>{hrsLabel(done)} confirmed</span>
          {waiting > 0 ? <span style={S('color:#8A5A20')}>, {hrsLabel(waiting)} waiting</span> : null}
        </div>
      </div>
      <ul style={S('margin:6px 0 0;padding:0;list-style:none')}>
        {log.map((h) => {
          const on = !!confirmed[h.id];
          const working = busy === h.id;
          return (
            <li key={h.id} style={S('display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 0;border-top:1px solid #F1EBE4;flex-wrap:wrap')}>
              <span style={S('font:450 13px/1.3 Geist;flex:1;min-width:140px;color:#332D28')}>
                {h.activity}
                {h.date ? <span style={S('color:#6B635C')}>, {h.date}</span> : null}
              </span>
              <span style={S(`font:500 12px/1 ${MONO};color:#57504A`)}>{hrsLabel(h.hrs)}</span>
              {on ? (
                <span style={S('flex:none;display:inline-flex;align-items:center;gap:10px')}>
                  <span style={S('display:inline-flex;align-items:center;gap:4px;font:500 12px/1 Geist;color:#3F6B4E')}>
                    <Icon name="check" size={13} />
                    {working ? 'Removing' : 'Confirmed'}
                  </span>
                  <Pressable
                    label={`Remove confirmation for ${h.activity}`}
                    disabled={working}
                    onClick={() => toggle(h)}
                    className={cx(H.press)}
                    style={s('flex:none;display:inline-flex;align-items:center;padding:0 4px;height:32px;border:0;background:none;font:500 12px/1 Geist;color:#57504A;text-decoration:underline;text-underline-offset:3px;cursor:pointer', working ? 'opacity:.6' : '')}
                  >
                    Undo
                  </Pressable>
                </span>
              ) : (
                <Pressable
                  label={`Confirm ${hrsLabel(h.hrs)} for ${h.activity}`}
                  disabled={working}
                  onClick={() => toggle(h)}
                  className={cx(H.press)}
                  style={s('flex:none;display:inline-flex;align-items:center;padding:0 11px;height:32px;border-radius:8px;font:600 12px/1 Geist;cursor:pointer;background:#fff;border:1px solid #A8482A;color:#A8482A', working ? 'opacity:.6' : '')}
                >
                  {working ? 'Confirming' : 'Confirm'}
                </Pressable>
              )}
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
    setMemberAssignment(app.id, { role: role ? { id: role.id, name: role.name, briefing: role.briefing, color: role.color } : null }).then((res) => {
      if (res.ok) { toast({ title: role ? 'Role saved' : 'Role cleared', message: role ? `${app.applicant_name} is now ${role.name}` : app.applicant_name, tone: 'ok', timeout: 2000 }); reload(); }
      else toast({ title: "Couldn't save the role", message: 'Check your connection and try again.', tone: 'danger' });
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
    <div style={S('padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
      <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
        <div style={S('min-width:0;flex:1')}>
          <h2 style={S(`margin:0;${LABEL}`)}>Members from your join link</h2>
          <div style={S('margin-top:6px;font:450 13px/1.4 Geist;color:#57504A')}>People you accepted through your join link. Give each one a role and tasks.</div>
        </div>
        <Pressable label="Refresh members" onClick={reload} className={cx(H.secondary, H.press)} style={S('flex:none;display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:34px;border-radius:9px;border:1px solid #E8E1D9;background:#fff;font:500 13px/1 Geist;color:#57504A;cursor:pointer')}>
          <Icon name="refresh" size={13} />
          Refresh
        </Pressable>
      </div>

      <div style={S('margin-top:14px')}><ShareLink p={p} /></div>

      {members === null ? (
        <div role="status" style={S('margin-top:16px;font:450 13px/1.5 Geist;color:#6B635C')}>Loading members</div>
      ) : members.length === 0 ? (
        <div style={S('margin-top:16px')}>
          <EmptyState compact icon="users" title="No members from your link yet" body="Accept an application from your join link and they show up here." />
        </div>
      ) : (
        <div style={S('margin-top:16px;display:flex;flex-direction:column;gap:12px')}>
          {members.map((app) => {
            const a = app.assignment || {};
            const tasks = a.tasks || [];
            const done = (app.member_state && app.member_state.tasks) || {};
            const doneCount = tasks.filter((t) => done[t.id] === 'done').length;
            const acked = a.role && app.member_state && app.member_state.briefingAck && app.member_state.briefingAck[a.role.id];
            return (
              <div key={app.id} style={S('padding:16px;border-radius:13px;border:1px solid #F1EBE4;background:#FCFAF8')}>
                <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:center;justify-content:space-between;gap:14px')}>
                  <div style={S('display:flex;align-items:center;gap:11px;min-width:0')}>
                    <div style={S('width:36px;height:36px;border-radius:50%;overflow:hidden;flex:none')}>
                      <Avatar name={app.applicant_name} fs={14} />
                    </div>
                    <div style={S('min-width:0')}>
                      <div style={S('font:600 14px/1.2 Geist;color:#1A1714')}>{app.applicant_name}</div>
                      <div style={S('margin-top:3px;font:450 12px/1.3 Geist;color:#6B635C')}>
                        {app.position ? `Applied as ${app.position}` : 'Joined through your link'}
                        {a.role ? (acked ? ', read their briefing' : ", hasn't read their briefing") : ''}
                      </div>
                      <LastCheckIn app={app} p={p} />
                    </div>
                  </div>
                  <div style={S('display:flex;align-items:center;gap:9px;flex:none;flex-wrap:wrap')}>
                    <div style={S('min-width:150px')}>
                      <Select
                        label=""
                        ariaLabel={`Role for ${app.applicant_name}`}
                        value={a.role ? a.role.id : ''}
                        options={[{ v: '', l: 'No role yet' }, ...roles.map((r) => ({ v: r.id, l: r.name }))]}
                        onChange={(v) => assignRole(app, v)}
                        bg="#fff"
                        fs={13}
                      />
                    </div>
                    <Pressable label={`Tasks for ${app.applicant_name}`} onClick={() => editTasks(app)} className={cx(H.primary, H.press)} style={S('display:inline-flex;align-items:center;gap:6px;padding:0 14px;height:38px;border-radius:10px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 13px/1 Geist;cursor:pointer')}>
                      {tasks.length ? `Tasks (${doneCount} of ${tasks.length} done)` : 'Add tasks'}
                    </Pressable>
                    <MessageButton app={app} p={p} />
                    <RateButton app={app} onSaved={reload} />
                  </div>
                </div>
                {tasks.length ? (
                  <ul style={S('margin:12px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px')}>
                    {tasks.map((t) => {
                      const st = done[t.id] === 'done';
                      return (
                        <li key={t.id} style={S('display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:9px;background:#fff;border:1px solid #F1EBE4')}>
                          <span aria-hidden="true" style={s('width:16px;height:16px;border-radius:4px;flex:none;display:grid;place-items:center', st ? 'background:#3F6B4E;color:#fff' : 'background:#fff;border:1px solid #D8CFC5')}>
                            {st ? <Icon name="check" size={11} stroke={2.5} /> : null}
                          </span>
                          <span style={s('font:450 13px/1.3 Geist;flex:1;min-width:0', st ? 'color:#6B635C;text-decoration:line-through' : 'color:#332D28')}>{t.title}</span>
                          <span style={s('font:500 12px/1 Geist;flex:none', st ? 'color:#3F6B4E' : 'color:#6B635C')}>{st ? 'Done' : 'To do'}</span>
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
    </div>
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
          <div key={t.id} style={S('padding:12px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
            <div style={S('display:flex;align-items:center;gap:10px')}>
              <div style={S('flex:1;min-width:0')}>
                <Field label="" ariaLabel={`Task ${i + 1} title`} value={t.title} onChange={(v) => setT(i, { title: v })} placeholder="e.g. Pick up the trash grabbers" bg="#fff" fs={14} maxLength={90} />
              </div>
              {done[t.id] === 'done' ? (
                <span style={S('display:inline-flex;align-items:center;gap:4px;font:500 12px/1 Geist;color:#3F6B4E;flex:none')}>
                  <Icon name="check" size={12} />
                  Done
                </span>
              ) : null}
              <Pressable label={`Remove task ${i + 1}`} onClick={() => remove(i)} className={cx(H.danger, H.press)} style={S('display:grid;place-items:center;width:34px;height:34px;border-radius:8px;border:1px solid #EBD3C8;background:#fff;color:#A8482A;cursor:pointer;flex:none')}>
                <Icon name="x" size={14} />
              </Pressable>
            </div>
            <div style={S('margin-top:8px')}>
              <Field label="" ariaLabel={`Task ${i + 1} detail`} value={t.detail} onChange={(v) => setT(i, { detail: v })} placeholder="Detail (optional)" bg="#fff" fs={13} maxLength={160} />
            </div>
          </div>
        ))}
        {!tasks.length ? <div style={S('padding:14px;border-radius:11px;border:1px dashed #D8CFC5;background:#FCFAF8;font:450 13px/1.5 Geist;color:#57504A;text-align:center')}>No tasks yet. Add the first thing you want them to do.</div> : null}
      </div>
      <Pressable label="Add a task" onClick={add} className={cx(H.secondary, H.press)} style={S(`margin-top:12px;${OUTLINE_BTN}`)}>
        <Icon name="plus" size={14} />
        Add a task
      </Pressable>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>Cancel</Pressable>
        <Pressable label="Save tasks" disabled={busy} onClick={save} className={cx(H.primary, H.press)} style={S(MODAL_PRIMARY)}>{busy ? 'Saving' : 'Save tasks'}</Pressable>
      </div>
    </div>
  );
}

/* -------- volunteering: online members' progress through the steps ------- */

export function PipelineMembers({ p }) {
  const [members, reload] = useMembers(p);
  const steps = (p.pipeline || []).filter((x) => x && x.label);

  if (members === null) return null;

  return (
    <div style={S('position:relative;border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
      <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4')}>
        <h2 style={S(`margin:0;${LABEL}`)}>Members from your join link</h2>
        <div style={S('margin-top:5px;font:450 13px/1.4 Geist;color:#57504A')}>People you accepted through your join link. They mark their own steps done.</div>
      </div>
      <div style={S('padding:16px 20px')}><ShareLink p={p} /></div>
      {members.length === 0 ? (
        <div style={S('padding:0 20px 20px')}>
          <EmptyState compact icon="users" title="No members from your link yet" body="People you accept through your join link show up here with their progress." />
        </div>
      ) : (
        members.map((app) => {
          const doneMap = (app.member_state && app.member_state.pipeline) || {};
          const required = steps.filter((x) => x.required !== false);
          const cleared = required.filter((x) => doneMap[x.id]).length;
          const ready = required.length === 0 || cleared === required.length;
          return (
            <div key={app.id} style={S('padding:14px 20px;border-top:1px solid #F1EBE4')}>
              <div style={S('display:flex;align-items:center;gap:14px;flex-wrap:wrap')}>
                <div style={S('display:flex;align-items:center;gap:11px;min-width:180px;max-width:100%;flex:0 1 auto')}>
                  <div style={S('width:32px;height:32px;border-radius:50%;overflow:hidden;flex:none')}>
                    <Avatar name={app.applicant_name} fs={13} />
                  </div>
                  <div style={S('min-width:0')}>
                    <div className="vu-trunc" style={S('font:500 13px/1.2 Geist')}>{app.applicant_name}</div>
                    <div style={s('margin-top:4px;font:500 12px/1 Geist', ready ? 'color:#3F6B4E' : 'color:#8A5A20')}>{ready ? 'Ready for shifts' : `${cleared} of ${required.length} done`}</div>
                    <LastCheckIn app={app} p={p} />
                  </div>
                </div>
                <div style={S('flex:1;display:flex;gap:7px;flex-wrap:wrap;min-width:0')}>
                  {steps.map((step) => {
                    const on = !!doneMap[step.id];
                    return (
                      <span key={step.id} style={s('display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;font:500 12px/1.2 Geist', on ? 'background:#EAF3EC;border:1px solid #CFE4D5;color:#3F6B4E' : 'background:#FCFAF8;border:1px solid #F1EBE4;color:#57504A')}>
                        <span aria-hidden="true" style={s('width:14px;height:14px;border-radius:4px;flex:none;display:grid;place-items:center', on ? 'background:#3F6B4E;color:#fff' : 'background:#fff;border:1px solid #D8CFC5')}>
                          {on ? <Icon name="check" size={10} stroke={2.5} /> : null}
                        </span>
                        {step.label}
                        <span className="vu-sr">{on ? ', done' : ', not done'}</span>
                      </span>
                    );
                  })}
                </div>
                <div style={S('display:flex;gap:8px;flex:none;flex-wrap:wrap')}>
                  <MessageButton app={app} p={p} />
                  <RateButton app={app} onSaved={reload} />
                </div>
              </div>
              <MemberHoursConfirm app={app} onDone={reload} />
            </div>
          );
        })
      )}
    </div>
  );
}
