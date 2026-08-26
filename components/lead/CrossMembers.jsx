'use client';

/* ==========================================================================
   CrossMembers.jsx, people who joined THROUGH the app (cross-user)
   These aren't local roster rows; they're real other-account volunteers who
   applied to your public link and were accepted. The founder assigns each one a
   role and tasks here; the assignment is written to that person's application
   row and shows up on their own home screen. Their progress flows back through
   member_state. Founder-authoritative, member-reports, the guard trigger keeps
   the two halves from overwriting each other.
   ========================================================================== */

import { useEffect, useState, useCallback } from 'react';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable, Field, Select, TextArea, EmptyState, ImageSlot, Avatar } from '../ui.jsx';
import { openModal, confirmDialog, toast } from '../../lib/overlays.js';
import { copyText } from '../../lib/db.js';
import { loadProjectMembers, setMemberAssignment, confirmMemberHour } from '../../lib/listings.js';

const MONO = "'Geist Mono',monospace";

const RELIABILITY = ['', 'At risk', 'Developing', 'Solid', 'Strong', 'Exceptional'];

/** Open a star-rating modal for one cross-user member. The rating writes to the
    application's owner-side assignment, so it lands on the volunteer's account. */
export function openRating(app, onSaved) {
  openModal({
    title: `Rate ${app.applicant_name}`,
    subtitle: 'This goes on their VolunteerU profile for future organizers to see.',
    Body: ({ api }) => <RatingForm api={api} app={app} onSaved={onSaved} />,
  });
}

function RatingForm({ api, app, onSaved }) {
  const cur = (app.assignment && app.assignment.rating) || {};
  const [stars, setStars] = useState(cur.stars || 0);
  const [note, setNote] = useState(cur.note || '');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!stars) return;
    setBusy(true);
    const rating = { stars, reliability: RELIABILITY[stars], note: note.trim(), ratedAt: new Date().toISOString() };
    const { ok } = await setMemberAssignment(app.id, { rating });
    setBusy(false);
    if (ok) { api.close(); toast({ title: 'Rating saved', message: `${app.applicant_name} sees it on their profile.`, tone: 'ok' }); onSaved && onSaved(); }
    else toast({ title: 'Could not save', tone: 'danger' });
  }
  return (
    <div>
      <div style={S('display:flex;gap:6px')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setStars(n)} className={cx(H.press)} style={S(`font-size:30px;line-height:1;cursor:pointer;color:${n <= stars ? '#C2603C' : '#E0D8CF'}`)}>★</Pressable>
        ))}
      </div>
      <div style={S(`margin-top:8px;font:500 12px/1 ${MONO};color:#8A8179`)}>{stars ? RELIABILITY[stars] : 'Tap to rate'}</div>
      <div style={S('margin-top:16px')}>
        <TextArea label="A line of feedback (optional)" value={note} onChange={setNote} maxLength={280} minHeight={70} placeholder="What they did well, how they showed up." />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>Cancel</Pressable>
        <Pressable label="Save rating" disabled={busy || !stars} onClick={save} className={cx(H.primary, H.press)} style={s('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer', !stars ? 'opacity:.5' : '')}>{busy ? 'Saving…' : 'Save rating'}</Pressable>
      </div>
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
    loadProjectMembers(p.listingId).then(setMembers).catch(() => setMembers([]));
  }, [p.listingId]);
  useEffect(() => { load(); }, [load]);
  return [members, load, setMembers];
}

/** Small share-your-link banner, reused across both org types. */
export function ShareLink({ p, tone = 'soft' }) {
  const link = joinLink(p);
  const bg = tone === 'soft' ? '#FAF6F3' : '#fff';
  async function copy() {
    const ok = await copyText(link || p.recruitLink);
    toast(ok ? { title: 'Join link copied', message: 'Anyone with the link can view and apply.', tone: 'ok' } : { title: 'Copy this link', message: link || p.recruitLink, tone: 'warn' });
  }
  if (!link) {
    return (
      <div style={s('padding:14px 16px;border-radius:12px;border:1px solid #EFE3DC;font:450 13px/1.5 Geist;color:#8A5A20', `background:${bg}`)}>
        Your public join link turns on the moment this project finishes publishing. Share it to bring in members from other schools.
      </div>
    );
  }
  return (
    <div style={s('padding:14px 16px;border-radius:12px;border:1px solid #EFE3DC;display:flex;align-items:center;gap:12px;flex-wrap:wrap', `background:${bg}`)}>
      <div style={S('min-width:0;flex:1')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Your join link</div>
        <div className="vu-trunc" style={S('margin-top:6px;font:450 13px/1.3 Geist;color:#332D28')}>{link}</div>
      </div>
      <Pressable label="Copy the join link" onClick={copy} className={cx(H.secondary, H.press)} style={S('flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}>
        Copy link
      </Pressable>
    </div>
  );
}

/* A member's self-logged hours, with a Confirm toggle. Confirmed hours count on
   the volunteer's verified record. Shared by the team + pipeline managers. */
function MemberHoursConfirm({ app, onDone }) {
  const log = (app.member_state && app.member_state.hoursLog) || [];
  const confirmed = (app.assignment && app.assignment.confirmedHours) || {};
  const [busy, setBusy] = useState(null);
  if (!log.length) return null;
  const verified = log.filter((h) => confirmed[h.id]).reduce((a, h) => a + Number(h.hrs || 0), 0);
  const pending = log.filter((h) => !confirmed[h.id]).reduce((a, h) => a + Number(h.hrs || 0), 0);
  async function toggle(h) {
    if (busy) return;
    setBusy(h.id);
    const { ok } = await confirmMemberHour(app.id, h.id, !confirmed[h.id]);
    setBusy(null);
    if (ok) { toast({ title: confirmed[h.id] ? 'Confirmation removed' : 'Hours confirmed', message: confirmed[h.id] ? '' : 'Now verified on their record.', tone: 'ok', timeout: 1800 }); onDone && onDone(); }
    else toast({ title: 'Could not save', tone: 'danger' });
  }
  return (
    <div style={S('margin-top:12px;padding:12px;border-radius:11px;background:#fff;border:1px solid #F1EBE4')}>
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Hours to confirm</div>
        <div style={S('display:flex;gap:6px')}>
          <span style={s('padding:3px 8px;border-radius:6px;font:500 10px/1', 'font-family:' + MONO, 'background:#EAF3EC;color:#3F6B4E')}>{Math.round(verified * 10) / 10} verified</span>
          {pending > 0 ? <span style={s('padding:3px 8px;border-radius:6px;font:500 10px/1', 'font-family:' + MONO, 'background:#FDF3E7;color:#8A5A20')}>{Math.round(pending * 10) / 10} pending</span> : null}
        </div>
      </div>
      <div style={S('margin-top:9px;display:flex;flex-direction:column;gap:6px')}>
        {log.map((h) => {
          const on = !!confirmed[h.id];
          return (
            <div key={h.id} style={S('display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:9px;background:#FCFAF8;border:1px solid #F1EBE4')}>
              <span style={S('font:450 13px/1.3 Geist;flex:1;min-width:0;color:#332D28')}>{h.activity} · {h.date}</span>
              <span style={s('font:500 12px/1', 'font-family:' + MONO, 'color:#57504A')}>{h.hrs} hrs</span>
              <Pressable label={on ? 'Unconfirm' : 'Confirm'} disabled={busy === h.id} onClick={() => toggle(h)} className={cx(H.press)} style={s('flex:none;padding:0 11px;height:30px;border-radius:8px;font:600 12px/1 Geist;cursor:pointer', on ? 'background:#EAF3EC;border:1px solid #CFE4D5;color:#3F6B4E' : 'background:#fff;border:1px solid #A8482A;color:#A8482A')}>
                {on ? '✓ Confirmed' : 'Confirm'}
              </Pressable>
            </div>
          );
        })}
      </div>
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
      if (res.ok) { toast({ title: role ? `Role set: ${role.name}` : 'Role cleared', tone: 'ok', timeout: 1800 }); reload(); }
      else toast({ title: 'Could not save that', tone: 'danger' });
    });
  }

  function editTasks(app) {
    openModal({
      title: `Tasks for ${app.applicant_name}`,
      subtitle: 'They see these on their home screen and check them off as they go.',
      Body: ({ api }) => <MemberTaskForm api={api} app={app} onSaved={reload} />,
    });
  }

  return (
    <div style={S('padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
        <div>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Members from your link</div>
          <div style={S('margin-top:6px;font:450 13px/1.4 Geist;color:#8A8179')}>People who applied through your public link and were accepted. Give each a role and tasks, it lands on their home screen.</div>
        </div>
        <Pressable label="Refresh members" onClick={reload} className={cx(H.secondary, H.press)} style={S('flex:none;padding:0 12px;height:32px;border-radius:9px;border:1px solid #E8E1D9;background:#fff;font:500 12px/1 Geist;color:#57504A;cursor:pointer')}>Refresh</Pressable>
      </div>

      <div style={S('margin-top:14px')}><ShareLink p={p} /></div>

      {members === null ? (
        <div style={S('margin-top:16px;font:450 13px/1.5 Geist;color:#8A8179')}>Loading members…</div>
      ) : members.length === 0 ? (
        <div style={S('margin-top:16px')}>
          <EmptyState compact title="No online members yet" body="Accept an application from your link and they show up here to assign." />
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
                      <Avatar name={app.applicant_name} fs={16} />
                    </div>
                    <div style={S('min-width:0')}>
                      <div style={S('font:600 14px/1.2 Geist;color:#1A1714')}>{app.applicant_name}</div>
                      <div style={S('margin-top:3px;font:450 12px/1.3 Geist;color:#8A8179')}>
                        {app.position ? `Applied as ${app.position}` : 'Joined online'}
                        {a.role ? ` · ${acked ? 'briefing read' : 'briefing pending'}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={S('display:flex;align-items:center;gap:9px;flex:none;flex-wrap:wrap')}>
                    <div style={S('min-width:150px')}>
                      <Select
                        label=""
                        value={a.role ? a.role.id : ''}
                        options={[{ v: '', l: 'No role yet' }, ...roles.map((r) => ({ v: r.id, l: r.name }))]}
                        onChange={(v) => assignRole(app, v)}
                        bg="#fff"
                        fs={13}
                      />
                    </div>
                    <Pressable label={`Assign tasks to ${app.applicant_name}`} onClick={() => editTasks(app)} className={cx(H.primary, H.press)} style={S('padding:0 14px;height:38px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 12px/1 Geist;cursor:pointer')}>
                      Tasks {tasks.length ? `· ${doneCount}/${tasks.length}` : ''}
                    </Pressable>
                    <Pressable label={`Rate ${app.applicant_name}`} onClick={() => openRating(app, reload)} className={cx(H.secondary, H.press)} style={S('padding:0 12px;height:38px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;cursor:pointer')}>
                      {a.rating && a.rating.stars ? `★ ${a.rating.stars}` : 'Rate'}
                    </Pressable>
                  </div>
                </div>
                {tasks.length ? (
                  <div style={S('margin-top:12px;display:flex;flex-direction:column;gap:6px')}>
                    {tasks.map((t) => {
                      const st = done[t.id] === 'done';
                      return (
                        <div key={t.id} style={S('display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:9px;background:#fff;border:1px solid #F1EBE4')}>
                          <span style={s('width:15px;height:15px;border-radius:4px;flex:none;display:grid;place-items:center;font:600 9px/1 Geist', st ? 'background:#3F6B4E;color:#fff' : 'background:#F1EBE4;color:transparent')}>✓</span>
                          <span style={s('font:450 13px/1.3 Geist;flex:1', st ? 'color:#8A8179;text-decoration:line-through' : 'color:#332D28')}>{t.title}</span>
                          <span style={s('font:500 10px/1', 'font-family:' + MONO, st ? 'color:#3F6B4E' : 'color:#A9A097')}>{st ? 'done' : 'to do'}</span>
                        </div>
                      );
                    })}
                  </div>
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
    setBusy(true);
    const clean = tasks.filter((t) => t.title && t.title.trim()).map((t) => ({ id: t.id, title: t.title.trim(), detail: (t.detail || '').trim() }));
    const { ok } = await setMemberAssignment(app.id, { tasks: clean });
    setBusy(false);
    if (ok) { api.close(); toast({ title: 'Tasks saved', message: `${app.applicant_name} sees them now.`, tone: 'ok' }); onSaved && onSaved(); }
    else toast({ title: 'Could not save', tone: 'danger' });
  }

  return (
    <div>
      <div style={S('display:flex;flex-direction:column;gap:10px')}>
        {tasks.map((t, i) => (
          <div key={t.id} style={S('padding:12px;border-radius:11px;border:1px solid #F1EBE4;background:#FCFAF8')}>
            <div style={S('display:flex;align-items:center;gap:10px')}>
              <div style={S('flex:1')}>
                <Field label="" value={t.title} onChange={(v) => setT(i, { title: v })} placeholder="Task title" bg="#fff" fs={14} maxLength={90} />
              </div>
              {done[t.id] === 'done' ? <span style={S('font:500 11px/1 Geist;color:#3F6B4E;flex:none')}>✓ done</span> : null}
              <Pressable label="Remove task" onClick={() => remove(i)} className={cx(H.danger, H.press)} style={S('width:30px;height:30px;border-radius:8px;border:1px solid #EBD3C8;background:#fff;font:500 13px/1 Geist;color:#A8482A;cursor:pointer;flex:none')}>✕</Pressable>
            </div>
            <div style={S('margin-top:8px')}>
              <Field label="" value={t.detail} onChange={(v) => setT(i, { detail: v })} placeholder="Detail (optional)" bg="#fff" fs={13} maxLength={160} />
            </div>
          </div>
        ))}
        {!tasks.length ? <div style={S('padding:14px;border-radius:11px;border:1px dashed #E0D8CF;background:#FCFAF8;font:450 13px/1.5 Geist;color:#8A8179;text-align:center')}>No tasks yet. Add the first thing you want them to do.</div> : null}
      </div>
      <Pressable label="Add a task" onClick={add} className={cx(H.secondary, H.press)} style={S('margin-top:12px;display:inline-flex;align-items:center;gap:7px;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}>+ Add a task</Pressable>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>Cancel</Pressable>
        <Pressable label="Save tasks" disabled={busy} onClick={save} className={cx(H.primary, H.press)} style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}>{busy ? 'Saving…' : 'Save tasks'}</Pressable>
      </div>
    </div>
  );
}

/* -------- volunteering: online applicants' self-reported pipeline -------- */

export function PipelineMembers({ p }) {
  const [members, reload] = useMembers(p);
  const steps = (p.pipeline || []).filter((x) => x && x.label);

  if (members === null) return null;

  return (
    <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
      <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Members from your link</div>
        <div style={S('margin-top:5px;font:450 13px/1.4 Geist;color:#8A8179')}>Volunteers who applied online and were accepted, and where they are in the pipeline. They tick steps off themselves.</div>
      </div>
      <div style={S('padding:16px 20px')}><ShareLink p={p} /></div>
      {members.length === 0 ? (
        <div style={S('padding:0 20px 20px')}>
          <EmptyState compact title="No online members yet" body="Share your join link. Accepted applicants show here with their progress." />
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
              <div style={S('display:flex;align-items:center;gap:11px;min-width:180px;flex:none')}>
                <div style={S('width:32px;height:32px;border-radius:50%;overflow:hidden;flex:none')}>
                  <Avatar name={app.applicant_name} fs={16} />
                </div>
                <div style={S('min-width:0')}>
                  <div className="vu-trunc" style={S('font:500 13px/1.2 Geist')}>{app.applicant_name}</div>
                  <div style={s('margin-top:3px;font:500 11px/1', 'font-family:' + MONO, ready ? 'color:#3F6B4E' : 'color:#8A5A20')}>{ready ? 'Ready to staff' : `${cleared}/${required.length} cleared`}</div>
                </div>
              </div>
              <div style={S('flex:1;display:flex;gap:7px;flex-wrap:wrap')}>
                {steps.map((step) => {
                  const on = !!doneMap[step.id];
                  return (
                    <span key={step.id} style={s('display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;font:500 12px/1 Geist', on ? 'background:#EAF3EC;color:#3F6B4E' : 'background:#FCFAF8;border:1px solid #F1EBE4;color:#8A8179')}>
                      <span style={s('width:13px;height:13px;border-radius:4px;flex:none;display:grid;place-items:center;font:600 8px/1 Geist', on ? 'background:#3F6B4E;color:#fff' : 'background:#F1EBE4;color:transparent')}>✓</span>
                      {step.label}
                    </span>
                  );
                })}
              </div>
              <Pressable label={`Rate ${app.applicant_name}`} onClick={() => openRating(app, reload)} className={cx(H.secondary, H.press)} style={S('flex:none;padding:0 12px;height:34px;border-radius:9px;border:1px solid #E7C0AC;background:#fff;font:600 12px/1 Geist;color:#C2603C;cursor:pointer')}>
                {app.assignment && app.assignment.rating && app.assignment.rating.stars ? `★ ${app.assignment.rating.stars}` : 'Rate'}
              </Pressable>
              </div>
              <MemberHoursConfirm app={app} onDone={reload} />
            </div>
          );
        })
      )}
    </div>
  );
}
