'use client';

/* ==========================================================================
   PipelineTab.jsx — the QC pipeline every volunteer clears before shift one
   Leaders define the steps (a briefing call, a consent form, role training)
   and tick each volunteer through them. A volunteer with unfinished required
   steps can't be counted on a session.
   ========================================================================== */

import { useState } from 'react';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable, Field, Select, EmptyState, ImageSlot } from '../ui.jsx';
import { openModal, confirmDialog, toast } from '../../lib/overlays.js';
import {
  pipelineFor, pipelineProgress, addPipelineStep, updatePipelineStep, removePipelineStep, togglePipelineStep,
} from '../../lib/db.js';
import { PipelineMembers } from './CrossMembers.jsx';

const MONO = "'Geist Mono',monospace";
const KIND = { meeting: { l: 'Meeting', icon: '◷', bg: '#EEF3FB', color: '#5B6BB0' }, form: { l: 'Form', icon: '▤', bg: '#FDF3E7', color: '#8A5A20' }, training: { l: 'Training', icon: '◈', bg: '#EAF3EC', color: '#3F6B4E' }, check: { l: 'Check', icon: '✓', bg: '#F6F2EE', color: '#57504A' } };
const KIND_OPTS = Object.entries(KIND).map(([v, x]) => ({ v, l: x.l }));

export default function PipelineTab({ p }) {
  const steps = pipelineFor(p);
  // Everyone who still has to clear the pipeline, plus the freshly active.
  const roster = p.people.filter((x) => x.st === 'Onboarding' || x.st === 'Active' || x.st === 'Invited');

  function editStep(step) {
    openModal({
      title: step ? 'Edit step' : 'Add a pipeline step',
      Body: ({ api }) => <StepForm api={api} project={p} step={step} />,
    });
  }

  return (
    <div style={S('margin-top:22px;display:flex;flex-direction:column;gap:18px')}>
      <div style={S('padding:20px;border-radius:16px;border:1px solid #EFE3DC;background:#FAF6F3')}>
        <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Volunteer pipeline</div>
        <div style={S('margin-top:6px;font:600 18px/1.3 Geist;letter-spacing:-0.02em;max-width:640px')}>Quality control before the first shift</div>
        <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#6B635C;max-width:640px')}>
          Every volunteer you accept works through these steps first. Required steps must be clear before they can be staffed on a session — so a no-show at the briefing never becomes a no-show with a child.
        </div>
      </div>

      {/* steps */}
      <div style={S('padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
        <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
          <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Steps ({steps.length})</div>
          <Pressable label="Add a step" onClick={() => editStep(null)} className={cx(H.secondary, H.press)} style={S('flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#1A1714;cursor:pointer')}>+ Add step</Pressable>
        </div>
        {steps.length ? (
          <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
            {steps.map((step, i) => {
              const k = KIND[step.kind] || KIND.check;
              return (
                <div key={step.id} style={S('padding:14px 16px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;gap:12px')}>
                  <div style={s('width:26px;height:26px;border-radius:8px;flex:none;display:grid;place-items:center;font:600 11px/1', 'font-family:' + MONO, 'background:#F1EBE4;color:#8A8179')}>{i + 1}</div>
                  <div style={S('min-width:0;flex:1')}>
                    <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                      <span style={S('font:600 14px/1.2 Geist;color:#1A1714')}>{step.label}</span>
                      <span style={s('padding:3px 8px;border-radius:6px;font:500 10px/1 Geist', `background:${k.bg}`, `color:${k.color}`)}>{k.icon} {k.l}</span>
                      <span style={s('padding:3px 8px;border-radius:6px;font:500 10px/1', 'font-family:' + MONO, step.required ? 'background:#F5E7E0;color:#A8482A' : 'background:#F6F2EE;color:#8A8179')}>{step.required ? 'Required' : 'Optional'}</span>
                    </div>
                    {step.note ? <div style={S('margin-top:5px;font:450 12px/1.45 Geist;color:#8A8179')}>{step.note}</div> : null}
                  </div>
                  <div style={S('display:flex;gap:6px;flex:none')}>
                    <Pressable label="Edit step" onClick={() => editStep(step)} className={cx(H.secondary, H.press)} style={S('padding:6px 11px;border-radius:8px;border:1px solid #E8E1D9;background:#fff;font:500 12px/1 Geist;color:#57504A;cursor:pointer')}>Edit</Pressable>
                    <Pressable
                      label="Remove step"
                      onClick={async () => {
                        const ok = await confirmDialog({ title: 'Remove this step?', body: step.label, confirmLabel: 'Remove' });
                        if (ok) { removePipelineStep(p.id, step.id); toast({ title: 'Step removed', tone: 'ok' }); }
                      }}
                      className={cx(H.danger, H.press)}
                      style={S('padding:6px 11px;border-radius:8px;border:1px solid #EBD3C8;background:#fff;font:500 12px/1 Geist;color:#A8482A;cursor:pointer')}
                    >
                      Remove
                    </Pressable>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={S('margin-top:14px')}>
            <EmptyState compact title="No steps — volunteers work right away" body="Add a briefing, a consent form or role training to gate the first shift." cta="Add a step" onCta={() => editStep(null)} />
          </div>
        )}
      </div>

      {/* per-volunteer progress */}
      {steps.length ? (
        <div style={S('border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
          <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Who's cleared</div>
            <div style={S('margin-top:5px;font:450 13px/1.4 Geist;color:#8A8179')}>Tick a step as each volunteer completes it. Clearing every required step marks them ready to be staffed.</div>
          </div>
          {roster.length ? (
            roster.map((person) => {
              const prog = pipelineProgress(p, person);
              return (
                <div key={person.id} className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;gap:16px')}>
                  <div style={S('display:flex;align-items:center;gap:11px;min-width:170px;flex:none')}>
                    <div style={S('width:34px;height:34px;border-radius:50%;overflow:hidden;flex:none')}>
                      <ImageSlot src={`https://picsum.photos/seed/${person.slug}/200/200?grayscale`} shape="circle" placeholder="face" />
                    </div>
                    <div style={S('min-width:0')}>
                      <div className="vu-trunc" style={S('font:500 13px/1.2 Geist')}>{person.n}</div>
                      <div style={s('margin-top:3px;font:500 11px/1', 'font-family:' + MONO, prog.ready ? 'color:#3F6B4E' : 'color:#8A5A20')}>{prog.ready ? 'Ready to staff' : `${prog.cleared}/${prog.total} cleared`}</div>
                    </div>
                  </div>
                  <div style={S('flex:1;display:flex;gap:8px;flex-wrap:wrap')}>
                    {prog.steps.map((step) => (
                      <Pressable
                        key={step.id}
                        label={`${step.done ? 'Reopen' : 'Clear'} ${step.label} for ${person.n}`}
                        onClick={() => togglePipelineStep(p.id, person.id, step.id)}
                        className={H.press}
                        style={s(
                          'display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:9px;cursor:pointer;font:500 12px/1 Geist;transition:background .16s ease',
                          step.done ? 'background:#EAF3EC;border:1px solid #CFE4D5;color:#3F6B4E' : 'background:#fff;border:1px solid #E8E1D9;color:#57504A'
                        )}
                      >
                        <span style={s('width:15px;height:15px;border-radius:4px;flex:none;display:grid;place-items:center;font:600 9px/1 Geist', step.done ? 'background:#3F6B4E;color:#fff' : 'background:#F1EBE4;color:transparent')}>{step.done ? '✓' : ''}</span>
                        {step.label}
                      </Pressable>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={S('padding:10px 20px 20px')}>
              <EmptyState compact title="No local volunteers in the pipeline yet" body="Volunteers you add to the roster directly show here to work through the steps." />
            </div>
          )}
        </div>
      ) : null}

      {/* volunteers who joined through the public link (cross-user) */}
      <PipelineMembers p={p} />
    </div>
  );
}

function StepForm({ api, project, step }) {
  const [f, setF] = useState({ label: step ? step.label : '', kind: step ? step.kind : 'meeting', required: step ? step.required !== false : true, note: step ? step.note : '' });
  const [err, setErr] = useState('');
  return (
    <div>
      <Field label="Step" value={f.label} onChange={(v) => setF((x) => ({ ...x, label: v }))} placeholder="e.g. Attend the Zoom briefing" maxLength={70} required error={err} />
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:end')}>
        <Select label="Type" value={f.kind} options={KIND_OPTS} onChange={(v) => setF((x) => ({ ...x, kind: v }))} />
        <label style={S('display:flex;align-items:center;gap:9px;height:44px;padding:0 4px;cursor:pointer;font:450 13px/1 Geist;color:#57504A')}>
          <input type="checkbox" checked={f.required} onChange={(e) => setF((x) => ({ ...x, required: e.target.checked }))} style={S('width:16px;height:16px;accent-color:#C2603C;cursor:pointer')} />
          Required before a shift
        </label>
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="Note for the volunteer" value={f.note} onChange={(v) => setF((x) => ({ ...x, note: v }))} placeholder="Optional — a line they see, e.g. a Zoom link or what to bring." maxLength={140} />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>Cancel</Pressable>
        <Pressable
          label={step ? 'Save step' : 'Add step'}
          onClick={() => {
            if (!f.label.trim()) { setErr('Give the step a name.'); return; }
            if (step) updatePipelineStep(project.id, step.id, { label: f.label.trim(), kind: f.kind, required: f.required, note: f.note });
            else addPipelineStep(project.id, { label: f.label.trim(), kind: f.kind, required: f.required, note: f.note });
            api.close();
            toast({ title: step ? 'Step updated' : 'Step added', tone: 'ok', timeout: 2000 });
          }}
          className={cx(H.primary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
        >
          {step ? 'Save' : 'Add'}
        </Pressable>
      </div>
    </div>
  );
}
