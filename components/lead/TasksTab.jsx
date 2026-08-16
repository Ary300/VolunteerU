'use client';

/* ==========================================================================
   TasksTab.jsx — the task-based team workspace (leader end)
   Roles with briefings + a three-column task board. This replaces shifts,
   attendance and hours for projects whose orgType is 'team'.
   ========================================================================== */

import { useState } from 'react';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable, Field, Select, TextArea, EmptyState, ImageSlot } from '../ui.jsx';
import { openModal, confirmDialog, toast, menuFromEvent } from '../../lib/overlays.js';
import {
  taskRoles, tasksOf, taskStats, roleOf,
  addTaskRole, updateTaskRole, deleteTaskRole,
  addTask, updateTask, setTaskStatus, assignTask, deleteTask,
} from '../../lib/db.js';
import { TeamMembersManager } from './CrossMembers.jsx';

const MONO = "'Geist Mono',monospace";

const COLUMNS = [
  { key: 'todo', label: 'To do', hint: 'Not started' },
  { key: 'doing', label: 'In progress', hint: 'Being worked on' },
  { key: 'done', label: 'Done', hint: 'Finished' },
];

const NEXT = { todo: 'doing', doing: 'done', done: null };
const PREV = { todo: null, doing: 'todo', done: 'doing' };

export default function TasksTab({ p }) {
  const roles = taskRoles(p);
  const tasks = tasksOf(p);
  const stats = taskStats(p);
  const members = p.people.filter((x) => x.st !== 'Removed' && x.st !== 'Inactive');

  function roleChip(roleId) {
    const r = roleOf(p, roleId);
    if (!r) return null;
    return (
      <span style={s('display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:6px;font:500 10px/1 Geist', `background:${r.color}18`, `color:${r.color}`)}>
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
      title: role ? `Edit role: ${role.name}` : 'Add a role',
      subtitle: 'The briefing is what a member reads before their tasks unlock.',
      Body: ({ api }) => <RoleForm api={api} project={p} role={role} />,
    });
  }

  function assignMenu(e, task) {
    menuFromEvent(
      e,
      [
        { key: '', label: 'Unassigned', checked: !task.assigneeId },
        ...members.map((m) => ({ key: m.id, label: m.short || m.n, checked: m.id === task.assigneeId })),
      ],
      (key) => {
        assignTask(p.id, task.id, key || null);
        toast({ title: key ? 'Task assigned' : 'Task unassigned', tone: 'ok', timeout: 1800 });
      }
    );
  }

  async function taskMenu(e, task) {
    menuFromEvent(
      e,
      [
        task.status !== 'todo' ? { key: 'todo', label: 'Move to To do', icon: '◦' } : null,
        task.status !== 'doing' ? { key: 'doing', label: 'Move to In progress', icon: '◐' } : null,
        task.status !== 'done' ? { key: 'done', label: 'Move to Done', icon: '●' } : null,
        { sep: true },
        { key: 'edit', label: 'Edit task', icon: '✎' },
        { key: 'assign', label: 'Assign to…', icon: '☺' },
        { sep: true },
        { key: 'delete', label: 'Delete task', icon: '✕', tone: 'danger' },
      ].filter(Boolean),
      async (key) => {
        if (key === 'edit') editTask(task);
        else if (key === 'assign') assignMenu(e, task);
        else if (key === 'delete') {
          const ok = await confirmDialog({ title: 'Delete this task?', body: task.title, confirmLabel: 'Delete' });
          if (ok) { deleteTask(p.id, task.id); toast({ title: 'Task deleted', tone: 'ok' }); }
        } else {
          setTaskStatus(p.id, task.id, key);
        }
      }
    );
  }

  return (
    <div style={S('margin-top:22px;display:flex;flex-direction:column;gap:18px')}>
      {/* progress */}
      <div className="vu-4col" style={S('display:grid;grid-template-columns:repeat(4,1fr);gap:12px')}>
        {[
          { l: 'Tasks done', v: `${stats.done} / ${stats.total}` },
          { l: 'In progress', v: String(stats.doing) },
          { l: 'To do', v: String(stats.todo) },
          { l: 'Roles', v: String(stats.roles) },
        ].map((k) => (
          <div key={k.l} style={S('padding:16px;border-radius:12px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>{k.l}</div>
            <div style={S('margin-top:10px;font:600 22px/1 Geist;letter-spacing:-0.03em')}>{k.v}</div>
          </div>
        ))}
      </div>
      <div style={S('height:8px;border-radius:99px;background:#F1EBE4;overflow:hidden')}>
        <div style={s('height:100%;border-radius:99px;background:linear-gradient(90deg,#D2775B,#C2603C);transition:width .3s ease', `width:${stats.pct}%`)} />
      </div>

      {/* roles & briefings */}
      <div style={S('padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
        <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
          <div>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Roles & briefings</div>
            <div style={S('margin-top:6px;font:450 13px/1.4 Geist;color:#8A8179')}>Each member joins a role and reads its briefing before their tasks unlock.</div>
          </div>
          <Pressable label="Add a role" onClick={() => editRole(null)} className={cx(H.secondary, H.press)} style={S('flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#1A1714;cursor:pointer')}>
            + Add role
          </Pressable>
        </div>
        {roles.length ? (
          <div className="vu-3col" style={S('margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px')}>
            {roles.map((r) => {
              const count = members.filter((m) => m.teamRoleId === r.id).length;
              const taskCount = tasks.filter((t) => t.roleId === r.id).length;
              return (
                <Pressable
                  key={r.id}
                  label={`Edit ${r.name}`}
                  onClick={() => editRole(r)}
                  className={cx(H.card, H.press)}
                  style={S('text-align:left;padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8;cursor:pointer;transition:border-color .16s ease')}
                >
                  <div style={S('display:flex;align-items:center;gap:8px')}>
                    <span style={s('width:9px;height:9px;border-radius:50%;flex:none', `background:${r.color}`)} />
                    <div style={S('font:600 14px/1.2 Geist;color:#1A1714')}>{r.name}</div>
                  </div>
                  <div style={S('margin-top:8px;font:450 12px/1.55 Geist;color:#57504A;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden')}>
                    {r.briefing || 'No briefing yet — click to add one.'}
                  </div>
                  <div style={S(`margin-top:10px;font:500 11px/1 ${MONO};color:#A9A097`)}>{count} member{count === 1 ? '' : 's'} · {taskCount} task{taskCount === 1 ? '' : 's'}</div>
                </Pressable>
              );
            })}
          </div>
        ) : (
          <div style={S('margin-top:14px')}>
            <EmptyState compact title="No roles yet" body="Add a role with a briefing so members know what they own." cta="Add a role" onCta={() => editRole(null)} />
          </div>
        )}
      </div>

      {/* members who joined through the public link */}
      <TeamMembersManager p={p} />

      {/* board */}
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Task board</div>
        <Pressable label="Add a task" onClick={() => editTask(null)} className={cx(H.primary, H.press)} style={S('flex:none;display:inline-flex;align-items:center;gap:7px;padding:0 14px;height:36px;border-radius:10px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 13px/1 Geist;cursor:pointer')}>
          <span aria-hidden="true" style={S('font-size:10px;opacity:.9')}>▷</span>
          Add task
        </Pressable>
      </div>
      <div className="vu-scroll-x" style={S('display:grid;grid-template-columns:repeat(3,minmax(240px,1fr));gap:14px;overflow-x:auto')}>
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} style={S('border-radius:14px;border:1px solid #E8E1D9;background:#FCFAF8;overflow:hidden;min-width:240px')}>
              <div style={S('padding:13px 15px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:8px')}>
                <div style={S('font:600 13px/1 Geist;color:#1A1714')}>{col.label}</div>
                <span style={S(`font:500 11px/1 ${MONO};color:#A9A097`)}>{colTasks.length}</span>
              </div>
              <div style={S('padding:12px;display:flex;flex-direction:column;gap:10px;min-height:60px')}>
                {colTasks.map((task) => {
                  const who = assigneeOf(task);
                  return (
                    <div key={task.id} style={S('padding:13px;border-radius:11px;border:1px solid #EFE7DE;background:#fff')}>
                      <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:8px')}>
                        <div style={s('font:500 13.5px/1.35 Geist;color:#1A1714', task.status === 'done' ? 'text-decoration:line-through;color:#8A8179' : '')}>{task.title}</div>
                        <Pressable label="Task actions" expanded={false} onClick={(e) => taskMenu(e, task)} className={cx(H.toInk, H.press)} style={S('flex:none;font:500 14px/1 Geist;color:#A9A097;cursor:pointer;padding:0 2px')}>···</Pressable>
                      </div>
                      {task.detail ? <div style={S('margin-top:6px;font:450 12px/1.45 Geist;color:#8A8179')}>{task.detail}</div> : null}
                      <div style={S('margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                        {roleChip(task.roleId)}
                        {who ? (
                          <span style={S('display:inline-flex;align-items:center;gap:6px;padding:2px 8px 2px 2px;border-radius:99px;background:#F6F2EE')}>
                            <span style={S('width:18px;height:18px;border-radius:50%;overflow:hidden;flex:none')}>
                              <ImageSlot src={`https://picsum.photos/seed/${who.slug}/200/200?grayscale`} shape="circle" placeholder="face" />
                            </span>
                            <span style={S('font:500 11px/1 Geist;color:#57504A')}>{who.short || who.n}</span>
                          </span>
                        ) : (
                          <Pressable label="Assign task" expanded={false} onClick={(e) => assignMenu(e, task)} className={cx(H.secondary, H.press)} style={S('padding:3px 9px;border-radius:99px;border:1px dashed #D8D0C7;background:#fff;font:500 11px/1 Geist;color:#8A8179;cursor:pointer')}>+ Assign</Pressable>
                        )}
                      </div>
                      <div style={S('margin-top:11px;display:flex;gap:6px')}>
                        {PREV[task.status] ? (
                          <Pressable label={`Move to ${PREV[task.status]}`} onClick={() => setTaskStatus(p.id, task.id, PREV[task.status])} className={cx(H.secondary, H.press)} style={S('flex:1;height:30px;border-radius:8px;border:1px solid #E8E1D9;background:#fff;font:500 11px/1 Geist;color:#8A8179;cursor:pointer')}>‹ Back</Pressable>
                        ) : null}
                        {NEXT[task.status] ? (
                          <Pressable label={`Move to ${NEXT[task.status]}`} onClick={() => { setTaskStatus(p.id, task.id, NEXT[task.status]); if (NEXT[task.status] === 'done') toast({ title: 'Nice — task done', tone: 'ok', timeout: 1800 }); }} className={cx(H.secondary, H.press)} style={S('flex:1;height:30px;border-radius:8px;border:1px solid #E4DDD4;background:#FAF6F3;font:600 11px/1 Geist;color:#C2603C;cursor:pointer')}>{NEXT[task.status] === 'done' ? 'Mark done ✓' : 'Advance ›'}</Pressable>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {!colTasks.length ? (
                  <div style={S('padding:16px 8px;text-align:center;font:450 12px/1.5 Geist;color:#B7AEA4')}>Nothing here</div>
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
    title: task ? task.title : '',
    detail: task ? task.detail : '',
    roleId: task ? task.roleId || '' : (roles[0] ? roles[0].id : ''),
    assigneeId: task ? task.assigneeId || '' : '',
    status: task ? task.status : 'todo',
  });
  const [err, setErr] = useState('');
  const roleOpts = [{ v: '', l: 'No role' }, ...roles.map((r) => ({ v: r.id, l: r.name }))];
  const memberOpts = [{ v: '', l: 'Unassigned' }, ...members.map((m) => ({ v: m.id, l: m.short || m.n }))];
  const statusOpts = [{ v: 'todo', l: 'To do' }, { v: 'doing', l: 'In progress' }, { v: 'done', l: 'Done' }];
  return (
    <div>
      <Field label="Task" value={f.title} onChange={(v) => setF((x) => ({ ...x, title: v }))} placeholder="What needs doing?" maxLength={90} required error={err} />
      <div style={S('margin-top:14px')}>
        <TextArea label="Detail" value={f.detail} onChange={(v) => setF((x) => ({ ...x, detail: v }))} maxLength={300} minHeight={64} placeholder="Anything the person should know (optional)." />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Select label="Role" value={f.roleId} options={roleOpts} onChange={(v) => setF((x) => ({ ...x, roleId: v }))} />
        <Select label="Assign to" value={f.assigneeId} options={memberOpts} onChange={(v) => setF((x) => ({ ...x, assigneeId: v }))} />
      </div>
      <div style={S('margin-top:14px')}>
        <Select label="Status" value={f.status} options={statusOpts} onChange={(v) => setF((x) => ({ ...x, status: v }))} />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>Cancel</Pressable>
        <Pressable
          label={task ? 'Save task' : 'Add task'}
          onClick={() => {
            if (!f.title.trim()) { setErr('Give the task a title.'); return; }
            if (task) updateTask(project.id, task.id, { title: f.title.trim(), detail: f.detail, roleId: f.roleId || null, assigneeId: f.assigneeId || null, status: f.status });
            else addTask(project.id, { title: f.title.trim(), detail: f.detail, roleId: f.roleId || null, assigneeId: f.assigneeId || null, status: f.status });
            api.close();
            toast({ title: task ? 'Task updated' : 'Task added', tone: 'ok', timeout: 2000 });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          {task ? 'Save' : 'Add'}
        </Pressable>
      </div>
    </div>
  );
}

const RF_COLORS = ['#C2603C', '#3F6B4E', '#5B6BB0', '#8A5A20', '#9B4A6B', '#4A7C8A'];

function RoleForm({ api, project, role }) {
  const [f, setF] = useState({ name: role ? role.name : '', briefing: role ? role.briefing : '', color: role ? role.color : '#C2603C' });
  const [err, setErr] = useState('');
  return (
    <div>
      <Field label="Role name" value={f.name} onChange={(v) => setF((x) => ({ ...x, name: v }))} placeholder="e.g. Outreach lead" maxLength={40} required error={err} />
      <div style={S('margin-top:14px;display:flex;gap:7px;flex-wrap:wrap')}>
        {RF_COLORS.map((c) => (
          <Pressable key={c} label="Set color" onClick={() => setF((x) => ({ ...x, color: c }))} style={s('width:24px;height:24px;border-radius:50%;cursor:pointer', `background:${c}`, `border:2px solid ${f.color === c ? '#1A1714' : 'transparent'}`)} />
        ))}
      </div>
      <div style={S('margin-top:14px')}>
        <TextArea label="Briefing" value={f.briefing} onChange={(v) => setF((x) => ({ ...x, briefing: v }))} maxLength={600} minHeight={120} placeholder="What this role owns, how the team works, and what to do first. Members confirm they read this before their tasks unlock." />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:space-between;gap:10px;align-items:center')}>
        {role ? (
          <Pressable
            label="Delete role"
            onClick={async () => {
              const ok = await confirmDialog({ title: `Delete ${role.name}?`, body: 'Tasks tagged to this role stay on the board but lose their role tag.', confirmLabel: 'Delete role' });
              if (ok) { deleteTaskRole(project.id, role.id); api.close(); toast({ title: 'Role deleted', tone: 'ok' }); }
            }}
            className={cx(H.danger, H.press)}
            style={S('display:inline-flex;align-items:center;padding:0 14px;height:40px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;font:600 13px/1 Geist;color:#A8482A;cursor:pointer')}
          >
            Delete
          </Pressable>
        ) : <span />}
        <div style={S('display:flex;gap:10px')}>
          <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>Cancel</Pressable>
          <Pressable
            label={role ? 'Save role' : 'Add role'}
            onClick={() => {
              if (!f.name.trim()) { setErr('Give the role a name.'); return; }
              if (role) updateTaskRole(project.id, role.id, { name: f.name.trim(), briefing: f.briefing, color: f.color });
              else addTaskRole(project.id, { name: f.name.trim(), briefing: f.briefing, color: f.color });
              api.close();
              toast({ title: role ? 'Role updated' : `${f.name.trim()} added`, tone: 'ok', timeout: 2000 });
            }}
            className={cx(H.primary, H.press)}
            style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
          >
            {role ? 'Save' : 'Add'}
          </Pressable>
        </div>
      </div>
    </div>
  );
}
