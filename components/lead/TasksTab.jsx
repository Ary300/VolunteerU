'use client';

/* ==========================================================================
   TasksTab.jsx, the task-based team workspace (leader end)
   Roles with briefings + a three-column task board. This replaces shifts,
   attendance and hours for projects whose orgType is 'team'.
   ========================================================================== */

import { useState } from 'react';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable, Field, Select, TextArea, EmptyState, ImageSlot, Icon, SectionLabel } from '../ui.jsx';
import { openModal, confirmDialog, toast, menuFromEvent } from '../../lib/overlays.js';
import {
  taskRoles, tasksOf, taskStats, roleOf,
  addTaskRole, updateTaskRole, deleteTaskRole,
  addTask, updateTask, setTaskStatus, assignTask, deleteTask,
} from '../../lib/db.js';
import { TeamMembersManager } from './CrossMembers.jsx';
import { syncListing } from './Tabs.jsx';

const MONO = "'Geist Mono',monospace";

const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'In progress' },
  { key: 'done', label: 'Done' },
];
const COL_LABEL = { todo: 'To do', doing: 'In progress', done: 'Done' };

const NEXT = { todo: 'doing', doing: 'done', done: null };
const PREV = { todo: null, doing: 'todo', done: 'doing' };

const BTN = 'display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;font:600 13px/1 Geist;cursor:pointer;transition:background .16s ease, border-color .16s ease';
const BTN_PRIMARY = `${BTN};border:1px solid #A8482A;background:#C2603C;color:#fff`;
const BTN_BRAND = `${BTN};border:1px solid #E7C0AC;background:#fff;color:#C2603C`;
const MODAL_CANCEL = 'display:inline-flex;align-items:center;justify-content:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#1A1714;cursor:pointer';
const MODAL_PRIMARY = 'display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;cursor:pointer';
const CARD_BTN = 'display:inline-flex;align-items:center;justify-content:center;gap:5px;flex:1;height:30px;border-radius:8px;font:500 12px/1 Geist;cursor:pointer';

/* Older workspaces stored the task name as `t`. */
function titleOf(task) {
  return task.title || task.t || 'Untitled task';
}

export default function TasksTab({ p }) {
  const roles = taskRoles(p);
  const tasks = tasksOf(p);
  const stats = taskStats(p);
  const members = p.people.filter((x) => x.st !== 'Removed' && x.st !== 'Inactive');

  function roleChip(roleId) {
    const r = roleOf(p, roleId);
    if (!r) return null;
    return (
      <span style={s('display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:6px;font:500 11px/1 Geist', `background:${r.color}18`, `color:${r.color}`)}>
        <span style={s('width:7px;height:7px;border-radius:50%;flex:none', `background:${r.color}`)} />
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
        else if (key === 'assign') assignMenu(e, task);
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
    <div style={S('margin-top:22px;display:flex;flex-direction:column;gap:18px')}>
      {/* roles & briefings */}
      <div style={S('padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
        <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
          <div style={S('min-width:0')}>
            <SectionLabel>Roles</SectionLabel>
            <div style={S('margin-top:6px;font:450 13px/1.4 Geist;color:#8A8179')}>Members see their role's briefing and confirm they've read it.</div>
          </div>
          <Pressable label="Add a role" onClick={() => editRole(null)} className={cx(H.secondary, H.press)} style={S(BTN_BRAND)}>
            <Icon name="plus" size={14} />
            Add role
          </Pressable>
        </div>
        {roles.length ? (
          <div className="vu-3col" style={S('margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px')}>
            {roles.map((r) => {
              const taskCount = tasks.filter((t) => t.roleId === r.id).length;
              return (
                <Pressable
                  key={r.id}
                  label={`Edit ${r.name}`}
                  onClick={() => editRole(r)}
                  className={cx(H.card, H.press)}
                  style={S('display:block;text-align:left;padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8;cursor:pointer;transition:border-color .16s ease')}
                >
                  <div style={S('display:flex;align-items:center;justify-content:space-between;gap:8px')}>
                    <div style={S('display:flex;align-items:center;gap:8px;min-width:0')}>
                      <span style={s('width:9px;height:9px;border-radius:50%;flex:none', `background:${r.color}`)} />
                      <div className="vu-trunc" style={S('font:600 14px/1.2 Geist;color:#1A1714')}>{r.name}</div>
                    </div>
                    <span style={S('color:#A19891;flex:none')}><Icon name="edit" size={13} /></span>
                  </div>
                  <div style={S('margin-top:8px;font:450 12px/1.55 Geist;color:#57504A;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden')}>
                    {r.briefing || 'No briefing yet. Add one so members know what to do first.'}
                  </div>
                  <div style={S('margin-top:10px;font:450 12px/1 Geist;color:#8A8179')}>{taskCount} {taskCount === 1 ? 'task' : 'tasks'}</div>
                </Pressable>
              );
            })}
          </div>
        ) : (
          <div style={S('margin-top:14px')}>
            <EmptyState compact icon="flag" title="No roles yet" body="Add a role with a short briefing so members know what they own." cta="Add a role" onCta={() => editRole(null)} />
          </div>
        )}
      </div>

      {/* members who joined through the public link */}
      <TeamMembersManager p={p} />

      {/* board */}
      <div style={S('display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
        <div style={S('min-width:0')}>
          <h2 style={S('margin:0;font:600 18px/1.25 Geist;letter-spacing:-0.025em')}>Task board</h2>
          <div style={S('margin-top:5px;font:450 13px/1.4 Geist;color:#8A8179')}>
            {stats.total ? `${stats.done} of ${stats.total} done. ` : ''}Only you see this board. Give members tasks from the list above.
          </div>
        </div>
        <Pressable label="Add a task" onClick={() => editTask(null)} className={cx(H.primary, H.press)} style={S(BTN_PRIMARY)}>
          <Icon name="plus" size={14} />
          Add task
        </Pressable>
      </div>
      {stats.total ? (
        <div role="progressbar" aria-label="Tasks done" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.pct} style={S('height:6px;border-radius:99px;background:#F1EBE4;overflow:hidden;margin-top:-6px')}>
          <div style={s('height:100%;border-radius:99px;background:#C2603C;transition:width .3s ease', `width:${stats.pct}%`)} />
        </div>
      ) : null}
      <div className="vu-scroll-x" style={S('display:grid;grid-template-columns:repeat(3,minmax(240px,1fr));gap:14px;overflow-x:auto')}>
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} style={S('border-radius:14px;border:1px solid #E8E1D9;background:#FCFAF8;overflow:hidden;min-width:240px')}>
              <div style={S('padding:13px 15px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:8px')}>
                <div style={S('font:600 13px/1 Geist;color:#1A1714')}>{col.label}</div>
                <span style={S(`font:500 11px/1 ${MONO};color:#8A8179`)}>{colTasks.length}</span>
              </div>
              <div style={S('padding:12px;display:flex;flex-direction:column;gap:10px;min-height:60px')}>
                {colTasks.map((task) => {
                  const who = assigneeOf(task);
                  const title = titleOf(task);
                  return (
                    <div key={task.id} style={S('padding:13px;border-radius:11px;border:1px solid #EFE7DE;background:#fff')}>
                      <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:8px')}>
                        <div className="vu-break" style={s('font:500 13.5px/1.35 Geist;color:#1A1714;min-width:0', task.status === 'done' ? 'text-decoration:line-through;color:#8A8179' : '')}>{title}</div>
                        <Pressable label={`More actions for ${title}`} expanded={false} onClick={(e) => taskMenu(e, task)} className={cx(H.toInk, H.press)} style={S('flex:none;display:grid;place-items:center;width:26px;height:26px;margin:-4px -4px 0 0;border-radius:7px;color:#8A8179;cursor:pointer')}>
                          <Icon name="more" size={16} />
                        </Pressable>
                      </div>
                      {task.detail ? <div className="vu-break" style={S('margin-top:6px;font:450 12px/1.45 Geist;color:#8A8179')}>{task.detail}</div> : null}
                      {task.due ? <div style={S('margin-top:6px;font:450 12px/1.3 Geist;color:#8A8179')}>Due {task.due}</div> : null}
                      {roleOf(p, task.roleId) || who || members.length ? (
                        <div style={S('margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                          {roleChip(task.roleId)}
                          {who ? (
                            <span style={S('display:inline-flex;align-items:center;gap:6px;padding:2px 8px 2px 2px;border-radius:99px;background:#F6F2EE')}>
                              <span style={S('width:18px;height:18px;border-radius:50%;overflow:hidden;flex:none')}>
                                <ImageSlot src={''} shape="circle" placeholder="face" />
                              </span>
                              <span style={S('font:500 11px/1 Geist;color:#57504A')}>{who.short || who.n}</span>
                            </span>
                          ) : members.length ? (
                            <Pressable label={`Assign ${title}`} expanded={false} onClick={(e) => assignMenu(e, task)} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:99px;border:1px dashed #D8D0C7;background:#fff;font:500 11px/1 Geist;color:#8A8179;cursor:pointer')}>
                              <Icon name="plus" size={11} />
                              Assign
                            </Pressable>
                          ) : null}
                        </div>
                      ) : null}
                      <div style={S('margin-top:11px;display:flex;gap:6px')}>
                        {PREV[task.status] ? (
                          <Pressable label={`Move ${title} back to ${COL_LABEL[PREV[task.status]]}`} onClick={() => move(task, PREV[task.status])} className={cx(H.secondary, H.press)} style={S(`${CARD_BTN};border:1px solid #E8E1D9;background:#fff;color:#6B635C`)}>
                            <Icon name="chevron-left" size={13} />
                            Back
                          </Pressable>
                        ) : null}
                        {NEXT[task.status] ? (
                          <Pressable label={NEXT[task.status] === 'done' ? `Mark ${title} done` : `Start ${title}`} onClick={() => move(task, NEXT[task.status])} className={cx(H.secondary, H.press)} style={S(`${CARD_BTN};border:1px solid #E7C0AC;background:#FAF6F3;color:#C2603C;font-weight:600`)}>
                            {NEXT[task.status] === 'done' ? <Icon name="check" size={13} /> : null}
                            {NEXT[task.status] === 'done' ? 'Mark done' : 'Start'}
                            {NEXT[task.status] === 'done' ? null : <Icon name="chevron-right" size={13} />}
                          </Pressable>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {!colTasks.length ? (
                  <div style={S('padding:16px 8px;text-align:center;font:450 12px/1.5 Geist;color:#8A8179')}>
                    {col.key === 'todo' ? 'No tasks to start' : col.key === 'doing' ? 'Nothing in progress' : 'Nothing done yet'}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
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
      <div style={S('margin-top:14px')}>
        <TextArea label="Details (optional)" value={f.detail} onChange={(v) => setF((x) => ({ ...x, detail: v }))} maxLength={300} minHeight={64} placeholder="e.g. Call the parks office before Friday" />
      </div>
      <div className="vu-2col-keep" style={S(`margin-top:14px;display:grid;grid-template-columns:${members.length ? '1fr 1fr' : '1fr'};gap:14px`)}>
        <Select label="Role" value={f.roleId} options={roleOpts} onChange={(v) => setF((x) => ({ ...x, roleId: v }))} />
        {members.length ? <Select label="Assign to" value={f.assigneeId} options={memberOpts} onChange={(v) => setF((x) => ({ ...x, assigneeId: v }))} /> : null}
      </div>
      <div style={S('margin-top:14px')}>
        <Select label="Column" value={f.status} options={statusOpts} onChange={(v) => setF((x) => ({ ...x, status: v }))} />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_CANCEL)}>Cancel</Pressable>
        <Pressable
          label={task ? 'Save task' : 'Add task'}
          onClick={() => {
            if (!f.title.trim()) { setErr('Enter a task.'); return; }
            const data = { title: f.title.trim(), detail: f.detail.trim(), roleId: f.roleId || null, assigneeId: f.assigneeId || null, status: f.status };
            if (task) updateTask(project.id, task.id, data);
            else addTask(project.id, data);
            api.close();
            toast({ title: task ? 'Task saved' : 'Task added', message: data.title, tone: 'ok', timeout: 2000 });
          }}
          className={cx(H.primary, H.press)}
          style={S(MODAL_PRIMARY)}
        >
          {task ? 'Save task' : 'Add task'}
        </Pressable>
      </div>
    </div>
  );
}

const RF_COLORS = [
  { c: '#C2603C', n: 'Terracotta' },
  { c: '#3F6B4E', n: 'Green' },
  { c: '#5B6BB0', n: 'Blue' },
  { c: '#8A5A20', n: 'Brown' },
  { c: '#9B4A6B', n: 'Plum' },
  { c: '#4A7C8A', n: 'Teal' },
];

function RoleForm({ api, project, role }) {
  const [f, setF] = useState({ name: role ? role.name : '', briefing: role ? role.briefing || '' : '', color: role ? role.color : '#C2603C' });
  const [err, setErr] = useState('');
  return (
    <div>
      <Field label="Role name" value={f.name} onChange={(v) => { setF((x) => ({ ...x, name: v })); if (err) setErr(''); }} placeholder="e.g. Outreach" maxLength={40} required error={err} />
      <div role="radiogroup" aria-label="Role color" style={S('margin-top:14px;display:flex;gap:7px;flex-wrap:wrap')}>
        {RF_COLORS.map(({ c, n }) => (
          <Pressable
            key={c}
            role="radio"
            aria-checked={f.color === c ? 'true' : 'false'}
            label={n}
            onClick={() => setF((x) => ({ ...x, color: c }))}
            style={s('width:26px;height:26px;border-radius:50%;cursor:pointer;display:grid;place-items:center;color:#fff', `background:${c}`, `box-shadow:0 0 0 2px #fff, 0 0 0 4px ${f.color === c ? '#1A1714' : 'transparent'}`)}
          >
            {f.color === c ? <Icon name="check" size={13} /> : null}
          </Pressable>
        ))}
      </div>
      <div style={S('margin-top:14px')}>
        <TextArea label="Briefing" value={f.briefing} onChange={(v) => setF((x) => ({ ...x, briefing: v }))} maxLength={600} minHeight={120} placeholder="e.g. Email science teachers and post updates" />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap')}>
        {role ? (
          <Pressable
            label={`Delete ${role.name}`}
            onClick={async () => {
              const ok = await confirmDialog({ title: `Delete ${role.name}?`, body: 'Its tasks stay on the board without a role.', confirmLabel: 'Delete role', cancelLabel: 'Keep it' });
              if (ok) {
                deleteTaskRole(project.id, role.id);
                syncListing(project.id);
                api.close();
                toast({ title: 'Role deleted', message: role.name, tone: 'ok' });
              }
            }}
            className={cx(H.danger, H.press)}
            style={S('display:inline-flex;align-items:center;gap:6px;padding:0 14px;height:40px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;font:600 13px/1 Geist;color:#A8482A;cursor:pointer')}
          >
            <Icon name="trash" size={14} />
            Delete role
          </Pressable>
        ) : <span />}
        <div style={S('display:flex;gap:10px')}>
          <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_CANCEL)}>Cancel</Pressable>
          <Pressable
            label={role ? 'Save role' : 'Add role'}
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
            className={cx(H.primary, H.press)}
            style={S(MODAL_PRIMARY)}
          >
            {role ? 'Save role' : 'Add role'}
          </Pressable>
        </div>
      </div>
    </div>
  );
}
