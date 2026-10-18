'use client';

/* ==========================================================================
   TasksTab.jsx, the task-based team workspace (leader end)
   Roles with briefings + a three-column task board. This replaces shifts,
   attendance and hours for projects whose orgType is 'team'.
   ========================================================================== */

import { Fragment, useEffect, useState } from 'react';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable, Field, Select, TextArea, EmptyState, Icon, Avatar, Button } from '../ui.jsx';
import { C, F, R, CAUSE } from '../../lib/tokens.js';
import { openModal, confirmDialog, toast, menuFromEvent } from '../../lib/overlays.js';
import {
  taskRoles, tasksOf, taskStats, roleOf,
  addTaskRole, updateTaskRole, deleteTaskRole,
  addTask, updateTask, setTaskStatus, assignTask, deleteTask,
} from '../../lib/db.js';
import { TeamMembersManager } from './CrossMembers.jsx';
import { loadProjectMembers } from '../../lib/listings.js';
import { syncListing, useNarrow, DialogActions, H2, LABEL, META, SMALL, NUM, RULE, TH } from './Tabs.jsx';

const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'In progress' },
  { key: 'done', label: 'Done' },
];
const COL_LABEL = { todo: 'To do', doing: 'In progress', done: 'Done' };

const NEXT = { todo: 'doing', doing: 'done', done: null };
const PREV = { todo: null, doing: 'todo', done: 'doing' };

/* Roles keep the color value the rest of the app stores (Create, the member
   view and db.js all read it), and draw it as the muted cause pair that does
   the same job, so a role reads like a cause chip. Ember stays reserved for
   the primary action, so the stored "Red" (#C2603C) draws as the civic
   indigo and no role is red. Lead.jsx's ROLE_DOT map draws the same tones. */
const RF_COLORS = [
  { c: '#C2603C', fg: CAUSE.civic.fg, bg: CAUSE.civic.bg, n: 'Indigo' },
  { c: '#3F6B4E', fg: CAUSE.environment.fg, bg: CAUSE.environment.bg, n: 'Green' },
  { c: '#5B6BB0', fg: CAUSE.education.fg, bg: CAUSE.education.bg, n: 'Blue' },
  { c: '#8A5A20', fg: CAUSE.animals.fg, bg: CAUSE.animals.bg, n: 'Amber' },
  { c: '#9B4A6B', fg: CAUSE.arts.fg, bg: CAUSE.arts.bg, n: 'Plum' },
  { c: '#4A7C8A', fg: CAUSE.health.fg, bg: CAUSE.health.bg, n: 'Teal' },
];

/* A role saved while "Red" drew as the food tone may hold that value. */
const LEGACY_RED = CAUSE.food.fg.toUpperCase();

/** { fg, bg } to draw a stored role color with. */
export function roleTone(color) {
  const raw = String(color || '').toUpperCase();
  const hit = RF_COLORS.find((x) => x.c.toUpperCase() === raw || x.fg.toUpperCase() === raw || (raw === LEGACY_RED && x.c === '#C2603C'));
  return hit ? { fg: hit.fg, bg: hit.bg } : { fg: color || C.ink2, bg: C.mist };
}

/* Accepted members who joined through the join link. Their team role lives on
   the application's assignment (Members from your join link), not the roster.
   Reloads when another screen changes applications. */
function useLinkMembers(listingId) {
  const [apps, setApps] = useState([]);
  useEffect(() => {
    if (!listingId) return undefined;
    let live = true;
    const load = () => loadProjectMembers(listingId)
      .then((rows) => { if (live) setApps(rows || []); })
      .catch((err) => console.error('[lead] could not load join-link members for role counts', err));
    load();
    window.addEventListener('vu:applications-changed', load);
    return () => {
      live = false;
      window.removeEventListener('vu:applications-changed', load);
    };
  }, [listingId]);
  return apps;
}

/** How many members hold each role: link members by their application's
    role, roster rows the lead added by teamRoleId. A roster row tied to a
    loaded application counts once, by the application. */
function roleMemberCounts(members, linkApps) {
  const counts = {};
  const bump = (id) => { if (id) counts[id] = (counts[id] || 0) + 1; };
  const appIds = new Set(linkApps.map((a) => a.id));
  linkApps.forEach((a) => bump(a.assignment && a.assignment.role && a.assignment.role.id));
  members.filter((m) => !(m.appId && appIds.has(m.appId))).forEach((m) => bump(m.teamRoleId));
  return counts;
}

/* Older workspaces stored the task name as `t`. */
function titleOf(task) {
  return task.title || task.t || 'Untitled task';
}

export default function TasksTab({ p }) {
  const roles = taskRoles(p);
  const tasks = tasksOf(p);
  const stats = taskStats(p);
  const members = p.people.filter((x) => x.st !== 'Removed' && x.st !== 'Inactive');
  const stackBoard = useNarrow(900);
  const linkApps = useLinkMembers(p.listingId);
  const memberCounts = roleMemberCounts(members, linkApps);

  /* A role on a task reads as text with its color dot, no tinted chip. */
  function roleChip(roleId) {
    const r = roleOf(p, roleId);
    if (!r) return null;
    const t = roleTone(r.color);
    return (
      <span style={S(`display:inline-flex;align-items:center;gap:6px;min-width:0;font:500 13px/18px ${F.body};color:${C.ink2}`)}>
        <span aria-hidden="true" style={s('width:7px;height:7px;border-radius:50%;flex:none', `background:${t.fg}`)} />
        {r.name}
      </span>
    );
  }

  function assigneeOf(task) {
    return members.find((m) => m.id === task.assigneeId) || null;
  }

  function editTask(task) {
    openModal({
      title: task ? 'Edit task' : 'Add a task',
      Body: ({ api }) => <TaskForm api={api} project={p} task={task} roles={roles} members={members} />,
    });
  }

  function editRole(role) {
    openModal({
      title: role ? `Edit ${role.name}` : 'Add a role',
      subtitle: 'Members in this role see the briefing on their Home tab.',
      Body: ({ api }) => <RoleForm api={api} project={p} role={role} />,
    });
  }

  function move(task, status) {
    setTaskStatus(p.id, task.id, status);
    toast({ title: status === 'done' ? 'Marked done' : `Moved to ${COL_LABEL[status]}`, message: titleOf(task), tone: 'ok', timeout: 1800 });
  }

  function assignMenu(e, task) {
    menuFromEvent(
      e,
      [
        { key: '', label: 'Nobody', checked: !task.assigneeId },
        ...members.map((m) => ({ key: m.id, label: m.short || m.n, checked: m.id === task.assigneeId })),
      ],
      (key) => {
        assignTask(p.id, task.id, key || null);
        const who = members.find((m) => m.id === key);
        toast({ title: who ? `Assigned to ${who.short || who.n}` : 'Unassigned', tone: 'ok', timeout: 1800 });
      }
    );
  }

  function taskMenu(e, task) {
    // Keep the trigger: React clears currentTarget once the click is handled.
    const anchor = e.currentTarget;
    menuFromEvent(
      e,
      [
        task.status !== 'todo' ? { key: 'todo', label: 'Move to To do', icon: 'arrow-left' } : null,
        task.status !== 'doing' ? { key: 'doing', label: 'Move to In progress', icon: 'arrow-right' } : null,
        task.status !== 'done' ? { key: 'done', label: 'Mark done', icon: 'check' } : null,
        { sep: true },
        { key: 'edit', label: 'Edit task', icon: 'edit' },
        members.length ? { key: 'assign', label: 'Assign', icon: 'user' } : null,
        { sep: true },
        { key: 'delete', label: 'Delete task', icon: 'trash', tone: 'danger' },
      ].filter(Boolean),
      async (key) => {
        if (key === 'edit') editTask(task);
        // Open the member menu after this menu has finished closing, or its close takes the new one with it.
        else if (key === 'assign') setTimeout(() => assignMenu({ currentTarget: anchor }, task), 0);
        else if (key === 'delete') {
          const ok = await confirmDialog({ title: 'Delete this task?', body: `"${titleOf(task)}" comes off the board.`, confirmLabel: 'Delete task', cancelLabel: 'Keep it' });
          if (ok) {
            deleteTask(p.id, task.id);
            toast({ title: 'Task deleted', tone: 'ok' });
          }
        } else {
          move(task, key);
        }
      }
    );
  }

  return (
    <div style={S('margin-top:32px;display:flex;flex-direction:column')}>
      {/* roles & briefings */}
      <section aria-labelledby="tt-roles">
        <div className="vu-sec-head" style={S('flex-wrap:wrap;align-items:center')}>
          <div style={S('min-width:0')}>
            <h2 id="tt-roles" style={S(H2)}>Roles</h2>
            <p style={S(`margin:6px 0 0;${META}`)}>Members see their role's briefing and confirm they've read it.</p>
          </div>
          <Button variant="outline" size="sm" icon="plus" onClick={() => editRole(null)} aria-label="Add a role">
            Add role
          </Button>
        </div>
        {roles.length ? (
          <ul className="vu-2col" style={S('margin:16px 0 0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:0 32px')}>
            {roles.map((r) => {
              const taskCount = tasks.filter((t) => t.roleId === r.id).length;
              const memberCount = memberCounts[r.id] || 0;
              const t = roleTone(r.color);
              return (
                <li key={r.id} style={S(`border-top:1px solid ${C.line};${RULE};margin-bottom:-1px`)}>
                  <Pressable
                    label={`Edit ${r.name}`}
                    onClick={() => editRole(r)}
                    className={cx(H.row, H.press)}
                    style={S('display:flex;align-items:flex-start;gap:14px;padding:16px 0;cursor:pointer;transition:background .16s ease')}
                  >
                    <span aria-hidden="true" style={s('flex:none;width:10px;height:10px;border-radius:50%;margin-top:7px', `background:${t.fg}`)} />
                    <span style={S('min-width:0;flex:1')}>
                      <span style={S('display:flex;align-items:baseline;justify-content:space-between;gap:10px')}>
                        <span className="vu-trunc" style={S(LABEL)}>{r.name}</span>
                        <span style={S(`flex:none;${SMALL};${NUM}`)}>
                          {memberCount} {memberCount === 1 ? 'member' : 'members'}, {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                        </span>
                      </span>
                      <span style={S(`margin-top:3px;${SMALL};display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)}>
                        {r.briefing || 'No briefing yet. Add one so members know what to do first.'}
                      </span>
                    </span>
                    <span aria-hidden="true" style={S(`flex:none;color:${C.ink3};margin-top:10px`)}><Icon name="chevron-right" size={18} /></span>
                  </Pressable>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState compact icon="flag" title="No roles yet" body="Add a role with a short briefing so members know what they own." cta="Add a role" onCta={() => editRole(null)} />
        )}
      </section>

      {/* members who joined through the public link */}
      <div style={S('margin-top:48px')}>
        <TeamMembersManager p={p} />
      </div>

      {/* board */}
      <section aria-labelledby="tt-board" style={S('margin-top:48px')}>
        <div className="vu-sec-head" style={S('flex-wrap:wrap;align-items:center')}>
          <div style={S('min-width:0')}>
            <h2 id="tt-board" style={S(H2)}>Task board</h2>
            <p style={S(`margin:6px 0 0;${META}`)}>
              {stats.total ? `${stats.done} of ${stats.total} done. ` : ''}Only you see this board. Give members tasks from the list above.
            </p>
          </div>
          <Button variant="primary" size="sm" icon="plus" onClick={() => editTask(null)} aria-label="Add a task">
            Add task
          </Button>
        </div>
        <div style={S(`margin-top:24px;display:grid;grid-template-columns:${stackBoard ? 'minmax(0,1fr)' : 'repeat(3,minmax(0,1fr))'};gap:${stackBoard ? 32 : 28}px`)}>
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} role="group" aria-label={`${col.label}, ${colTasks.length}`} style={S('min-width:0')}>
                <div style={S(`padding-bottom:10px;border-bottom:2px solid ${C.ink};display:flex;align-items:baseline;justify-content:space-between;gap:8px`)}>
                  <h3 style={S(`margin:0;font:600 15px/1.2 ${F.body};color:${C.ink}`)}>{col.label}</h3>
                  <span style={S(`${TH};${NUM}`)}>{colTasks.length}</span>
                </div>
                <ul style={S('margin:0;padding:0;list-style:none')}>
                  {colTasks.map((task) => {
                    const who = assigneeOf(task);
                    const title = titleOf(task);
                    const done = task.status === 'done';
                    return (
                      <li key={task.id} style={S(`padding:16px 0;${RULE}`)}>
                        <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:8px')}>
                          <div className="vu-break" style={s(`font:600 15px/1.35 ${F.body};min-width:0`, done ? `color:${C.ink2};text-decoration:line-through;text-decoration-color:${C.ink3}` : `color:${C.ink}`)}>{title}</div>
                          <Pressable label={`More actions for ${title}`} expanded={false} onClick={(e) => taskMenu(e, task)} className={cx(H.icon, H.press)} style={S(`flex:none;display:grid;place-items:center;width:36px;height:36px;margin:-8px -8px 0 0;border-radius:${R.control};color:${C.ink3};cursor:pointer`)}>
                            <Icon name="more" size={18} />
                          </Pressable>
                        </div>
                        {task.detail ? <div className="vu-break" style={S(`margin-top:4px;${SMALL}`)}>{task.detail}</div> : null}
                        {(() => {
                          // One meta line: due date · role · who has it (or Assign).
                          // A finished task never asks to be assigned.
                          const role = roleChip(task.roleId);
                          const parts = [
                            task.due ? <span key="due" style={S(NUM)}>Due {task.due}</span> : null,
                            role ? <span key="role" style={S('display:inline-flex;min-width:0')}>{role}</span> : null,
                            who ? (
                              <span key="who" style={S(`display:inline-flex;align-items:center;gap:6px;color:${C.ink}`)}>
                                <span style={S('width:20px;height:20px;border-radius:50%;overflow:hidden;flex:none')}>
                                  <Avatar name={who.n} fs={9} />
                                </span>
                                {who.short || who.n}
                              </span>
                            ) : members.length && !done ? (
                              <button
                                key="assign"
                                type="button"
                                aria-label={`Assign ${title}`}
                                aria-haspopup="menu"
                                aria-expanded="false"
                                onClick={(e) => assignMenu(e, task)}
                                className={cx('vu-link', H.press)}
                                style={S(`display:inline-flex;align-items:center;background:none;border:0;padding:0;cursor:pointer;font:600 13px/18px ${F.body};color:${C.ink};text-decoration:underline;text-underline-offset:3px`)}
                              >
                                Assign
                              </button>
                            ) : null,
                          ].filter(Boolean);
                          if (!parts.length) return null;
                          return (
                            <div style={S(`margin-top:8px;display:flex;align-items:center;flex-wrap:wrap;row-gap:4px;font:400 13px/18px ${F.body};color:${C.ink2}`)}>
                              {parts.map((el, i) => (
                                <Fragment key={el.key}>
                                  {i ? <span className="vu-sep" aria-hidden="true" style={S('padding:0 6px')}>·</span> : null}
                                  {el}
                                </Fragment>
                              ))}
                            </div>
                          );
                        })()}
                        {PREV[task.status] || NEXT[task.status] ? (
                          <div style={S('margin-top:12px;display:flex;align-items:center;gap:8px 16px;flex-wrap:wrap')}>
                            {NEXT[task.status] ? (
                              <Button variant={NEXT[task.status] === 'done' ? 'dark' : 'outline'} size="sm" icon={NEXT[task.status] === 'done' ? 'check' : 'arrow-right'} onClick={() => move(task, NEXT[task.status])} aria-label={NEXT[task.status] === 'done' ? `Mark ${title} done` : `Start ${title}`}>
                                {NEXT[task.status] === 'done' ? 'Mark done' : 'Start'}
                              </Button>
                            ) : null}
                            {PREV[task.status] ? (
                              <button
                                type="button"
                                onClick={() => move(task, PREV[task.status])}
                                aria-label={`Move ${title} back to ${COL_LABEL[PREV[task.status]]}`}
                                className={cx('vu-link', H.press)}
                                style={S(`background:none;border:0;padding:0;cursor:pointer;font:600 13px/1.2 ${F.body};color:${C.ink};text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px`)}
                              >
                                Move back
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                  {!colTasks.length ? (
                    <li style={S(`padding:16px 0;${RULE};${SMALL}`)}>
                      {col.key === 'todo' ? 'No tasks to start' : col.key === 'doing' ? 'Nothing in progress' : 'Nothing done yet'}
                    </li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TaskForm({ api, project, task, roles, members }) {
  const [f, setF] = useState({
    title: task ? titleOf(task) : '',
    detail: task ? task.detail || '' : '',
    roleId: task ? task.roleId || '' : (roles[0] ? roles[0].id : ''),
    assigneeId: task ? task.assigneeId || '' : '',
    status: task ? task.status : 'todo',
  });
  const [err, setErr] = useState('');
  const roleOpts = [{ v: '', l: 'No role' }, ...roles.map((r) => ({ v: r.id, l: r.name }))];
  const memberOpts = [{ v: '', l: 'Nobody yet' }, ...members.map((m) => ({ v: m.id, l: m.short || m.n }))];
  const statusOpts = [{ v: 'todo', l: 'To do' }, { v: 'doing', l: 'In progress' }, { v: 'done', l: 'Done' }];
  return (
    <div>
      <Field label="Task" value={f.title} onChange={(v) => { setF((x) => ({ ...x, title: v })); if (err) setErr(''); }} placeholder="e.g. Book Millbrook Park for Nov 7" maxLength={90} required error={err} />
      <div style={S('margin-top:16px')}>
        <TextArea label="Details (optional)" value={f.detail} onChange={(v) => setF((x) => ({ ...x, detail: v }))} maxLength={300} minHeight={64} placeholder="e.g. Call the parks office before Friday" />
      </div>
      <div className="vu-2col-keep" style={S(`margin-top:16px;display:grid;grid-template-columns:${members.length ? '1fr 1fr' : '1fr'};gap:14px`)}>
        <Select label="Role" value={f.roleId} options={roleOpts} onChange={(v) => setF((x) => ({ ...x, roleId: v }))} />
        {members.length ? <Select label="Assign to" value={f.assigneeId} options={memberOpts} onChange={(v) => setF((x) => ({ ...x, assigneeId: v }))} /> : null}
      </div>
      <div style={S('margin-top:16px')}>
        <Select label="Column" value={f.status} options={statusOpts} onChange={(v) => setF((x) => ({ ...x, status: v }))} />
      </div>
      <DialogActions>
        <Button variant="outline" onClick={() => api.close()} aria-label="Cancel">Cancel</Button>
        <Button
          variant="primary"
          aria-label={task ? 'Save task' : 'Add task'}
          onClick={() => {
            if (!f.title.trim()) { setErr('Enter a task.'); return; }
            const data = { title: f.title.trim(), detail: f.detail.trim(), roleId: f.roleId || null, assigneeId: f.assigneeId || null, status: f.status };
            if (task) updateTask(project.id, task.id, data);
            else addTask(project.id, data);
            api.close();
            toast({ title: task ? 'Task saved' : 'Task added', message: data.title, tone: 'ok', timeout: 2000 });
          }}
        >
          {task ? 'Save task' : 'Add task'}
        </Button>
      </DialogActions>
    </div>
  );
}

function RoleForm({ api, project, role }) {
  const [f, setF] = useState({ name: role ? role.name : '', briefing: role ? role.briefing || '' : '', color: role ? role.color || RF_COLORS[0].c : RF_COLORS[0].c });
  const [err, setErr] = useState('');
  return (
    <div>
      <Field label="Role name" value={f.name} onChange={(v) => { setF((x) => ({ ...x, name: v })); if (err) setErr(''); }} placeholder="e.g. Outreach" maxLength={40} required error={err} />
      <div style={S('margin-top:16px')}>
        <div id="rf-color" style={S(`font:600 13px/1.2 ${F.body};color:${C.ink}`)}>Color</div>
        <div role="group" aria-labelledby="rf-color" style={S('margin-top:10px;display:flex;gap:10px;flex-wrap:wrap')}>
          {RF_COLORS.map(({ c, fg, n }) => {
            const on = roleTone(f.color).fg === fg;
            return (
              <Pressable
                key={c}
                pressed={on}
                label={`Set color, ${n}`}
                title={n}
                onClick={() => setF((x) => ({ ...x, color: c }))}
                style={s('width:30px;height:30px;border-radius:50%;cursor:pointer;display:grid;place-items:center;color:#fff', `background:${fg}`, `box-shadow:0 0 0 2px #fff, 0 0 0 4px ${on ? C.ink : 'transparent'}`)}
              >
                {on ? <Icon name="check" size={15} stroke={2.25} /> : null}
              </Pressable>
            );
          })}
        </div>
      </div>
      <div style={S('margin-top:16px')}>
        <TextArea label="Briefing" value={f.briefing} onChange={(v) => setF((x) => ({ ...x, briefing: v }))} maxLength={600} minHeight={120} placeholder="e.g. Email science teachers and post updates" />
      </div>
      <DialogActions
        left={role ? (
          <Button
            variant="danger"
            icon="trash"
            aria-label={`Delete ${role.name}`}
            onClick={async () => {
              const ok = await confirmDialog({ title: `Delete ${role.name}?`, body: 'Its tasks stay on the board without a role.', confirmLabel: 'Delete role', cancelLabel: 'Keep it' });
              if (ok) {
                deleteTaskRole(project.id, role.id);
                syncListing(project.id);
                api.close();
                toast({ title: 'Role deleted', message: role.name, tone: 'ok' });
              }
            }}
          >
            Delete role
          </Button>
        ) : null}
      >
        <Button variant="outline" onClick={() => api.close()} aria-label="Cancel">Cancel</Button>
        <Button
          variant="primary"
          aria-label={role ? 'Save role' : 'Add role'}
          onClick={() => {
            if (!f.name.trim()) { setErr('Enter a role name.'); return; }
            const data = { name: f.name.trim(), briefing: f.briefing.trim(), color: f.color };
            if (role) updateTaskRole(project.id, role.id, data);
            else addTaskRole(project.id, data);
            // Members read roles from the published listing.
            syncListing(project.id);
            api.close();
            toast({ title: role ? 'Role saved' : 'Role added', message: data.name, tone: 'ok', timeout: 2000 });
          }}
        >
          {role ? 'Save role' : 'Add role'}
        </Button>
      </DialogActions>
    </div>
  );
}
