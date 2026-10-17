'use client';

/* ==========================================================================
   PipelineTab.jsx, the steps every volunteer finishes before their first shift
   Leads define the steps (a briefing call, a consent form, role training)
   and mark each volunteer through them.
   ========================================================================== */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { Pressable, Field, Select, EmptyState, Avatar, Icon } from '../ui.jsx';
import { openModal, confirmDialog, toast } from '../../lib/overlays.js';
import {
  pipelineFor, pipelineProgress, addPipelineStep, updatePipelineStep, removePipelineStep, togglePipelineStep,
} from '../../lib/db.js';
import { PipelineMembers, safeLink } from './CrossMembers.jsx';

const MONO = "'Geist Mono',monospace";
const LABEL = 'font:600 14px/1.2 Geist;color:#1A1714';
const KIND = {
  meeting: { l: 'Meeting', icon: 'calendar', bg: '#EEF3FB', color: '#43529A' },
  form: { l: 'Form', icon: 'file', bg: '#FDF3E7', color: '#8A5A20' },
  training: { l: 'Training', icon: 'award', bg: '#EAF3EC', color: '#3F6B4E' },
  check: { l: 'Check', icon: 'check', bg: '#F6F2EE', color: '#57504A' },
};
const KIND_OPTS = Object.entries(KIND).map(([v, x]) => ({ v, l: x.l }));
const TAG = 'display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:6px;font:500 12px/1 Geist';
const SMALL_BTN = 'display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 11px;height:32px;border-radius:8px;font:500 12px/1 Geist;cursor:pointer';
const MODAL_PRIMARY = 'display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:#C2603C;color:#fff;font:600 14px/1 Geist;cursor:pointer';
const MODAL_SECONDARY = 'display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;color:#1A1714;cursor:pointer';

export default function PipelineTab({ p }) {
  const router = useRouter();
  const steps = pipelineFor(p);
  // Everyone who still has to finish the steps, plus the freshly active.
  // Join-link members mark their own steps; they're listed under PipelineMembers.
  const roster = p.people.filter((x) => !x.appId && (x.st === 'Onboarding' || x.st === 'Active' || x.st === 'Invited'));

  function editStep(step) {
    openModal({
      title: step ? 'Edit step' : 'Add a step',
      Body: ({ api }) => <StepForm api={api} project={p} step={step} />,
    });
  }

  return (
    <div style={S('margin-top:22px;display:flex;flex-direction:column;gap:18px')}>
      <div style={S('padding:20px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
        <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
          <div style={S('min-width:0;max-width:640px')}>
            <h2 style={S('margin:0;font:600 18px/1.3 Geist;letter-spacing:-0.02em;color:#1A1714')}>Steps before the first shift</h2>
            <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#57504A')}>
              Volunteers you accept work through these. Mark each one done below as people finish it.
            </div>
          </div>
          <Pressable label="Add step" onClick={() => editStep(null)} className={cx(H.secondary, H.press)} style={S('flex:none;display:inline-flex;align-items:center;gap:7px;padding:0 14px;height:38px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#A8482A;cursor:pointer')}>
            <Icon name="plus" size={14} />
            Add step
          </Pressable>
        </div>
        {steps.length ? (
          <ol style={S('margin:16px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px')}>
            {steps.map((step, i) => {
              const k = KIND[step.kind] || KIND.check;
              const href = safeLink(step.link);
              const needsLink = STEP_FIELDS[step.kind] && STEP_FIELDS[step.kind].link && STEP_FIELDS[step.kind].link.required;
              const when = step.kind === 'form' ? (step.due ? `Due ${step.due}` : '') : step.when;
              return (
                <li key={step.id} className="vu-stack vu-stack-gap" style={S('padding:14px 16px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8;display:flex;align-items:center;gap:12px')}>
                  <div style={S('display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1')}>
                    <div aria-hidden="true" style={S(`width:26px;height:26px;border-radius:8px;flex:none;display:grid;place-items:center;font:600 12px/1 ${MONO};background:#F1EBE4;color:#57504A`)}>{i + 1}</div>
                    <div style={S('min-width:0;flex:1')}>
                      <div style={S('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                        <span style={S('font:600 14px/1.3 Geist;color:#1A1714')}>{step.label}</span>
                        <span style={s(TAG, `background:${k.bg}`, `color:${k.color}`)}>
                          <Icon name={k.icon} size={12} />
                          {k.l}
                        </span>
                        <span style={s(TAG, step.required ? 'background:#F5E7E0;color:#A8482A' : 'background:#F6F2EE;color:#57504A')}>{step.required ? 'Required' : 'Optional'}</span>
                        {when ? <span style={s(TAG, 'background:#EEF3FB;color:#43529A')}>{when}</span> : null}
                      </div>
                      {step.note ? <div style={S('margin-top:5px;font:450 13px/1.45 Geist;color:#57504A')}>{step.note}</div> : null}
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className={H.link} style={S('margin-top:6px;display:inline-flex;align-items:center;gap:6px;max-width:100%;font:450 13px/1.4 Geist;color:#43529A;text-decoration:underline;text-underline-offset:2px')}>
                          <Icon name="link" size={13} />
                          <span className="vu-trunc">{step.link}</span>
                        </a>
                      ) : needsLink ? (
                        <div style={S('margin-top:5px;font:500 13px/1.4 Geist;color:#A8482A')}>No link yet. Edit the step to add one so volunteers can do it.</div>
                      ) : null}
                    </div>
                  </div>
                  <div style={S('display:flex;gap:6px;flex:none')}>
                    <Pressable label={`Edit ${step.label}`} onClick={() => editStep(step)} className={cx(H.secondary, H.press)} style={S(`${SMALL_BTN};border:1px solid #E8E1D9;background:#fff;color:#57504A`)}>Edit</Pressable>
                    <Pressable
                      label={`Remove ${step.label}`}
                      onClick={async () => {
                        const ok = await confirmDialog({ title: 'Remove this step?', body: `"${step.label}" comes off the list for every volunteer.`, confirmLabel: 'Remove step' });
                        if (ok) { removePipelineStep(p.id, step.id); toast({ title: 'Step removed', message: step.label, tone: 'ok' }); }
                      }}
                      className={cx(H.danger, H.press)}
                      style={S(`${SMALL_BTN};border:1px solid #EBD3C8;background:#fff;color:#A8482A`)}
                    >
                      Remove
                    </Pressable>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div style={S('margin-top:14px')}>
            <EmptyState compact icon="list" title="No steps yet" body="Add a briefing, a consent form or training for before the first shift." cta="Add step" onCta={() => editStep(null)} />
          </div>
        )}
      </div>

      {/* per-volunteer progress */}
      {steps.length ? (
        <div style={S('position:relative;border-radius:16px;border:1px solid #E8E1D9;background:#fff;overflow:hidden')}>
          <div style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4')}>
            <h2 style={S(`margin:0;${LABEL}`)}>Progress</h2>
            <div style={S('margin-top:5px;font:450 13px/1.4 Geist;color:#57504A')}>Mark a step done when someone finishes it.</div>
          </div>
          {roster.length ? (
            roster.map((person) => {
              const prog = pipelineProgress(p, person);
              return (
                <div key={person.id} className="vu-stack vu-stack-gap" style={S('padding:16px 20px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;gap:16px')}>
                  <div style={S('display:flex;align-items:center;gap:11px;min-width:170px;flex:none')}>
                    <div style={S('width:34px;height:34px;border-radius:50%;overflow:hidden;flex:none')}>
                      <Avatar name={person.n} fs={13} />
                    </div>
                    <div style={S('min-width:0')}>
                      <div className="vu-trunc" style={S('font:500 13px/1.2 Geist')}>{person.n}</div>
                      <div style={s('margin-top:4px;font:500 12px/1 Geist', prog.ready ? 'color:#3F6B4E' : 'color:#8A5A20')}>{prog.ready ? 'Ready for shifts' : `${prog.cleared} of ${prog.total} done`}</div>
                    </div>
                  </div>
                  <div style={S('flex:1;display:flex;gap:8px;flex-wrap:wrap')}>
                    {prog.steps.map((step) => (
                      <Pressable
                        key={step.id}
                        role="checkbox"
                        aria-checked={!!step.done}
                        label={`${step.label} for ${person.n}`}
                        onClick={() => {
                          togglePipelineStep(p.id, person.id, step.id);
                          toast({ title: step.done ? 'Marked not done' : 'Marked done', message: `${step.label}, ${person.n}`, tone: 'ok', timeout: 1800 });
                        }}
                        className={H.press}
                        style={s(
                          'display:inline-flex;align-items:center;gap:7px;padding:0 11px;min-height:34px;border-radius:9px;cursor:pointer;font:500 13px/1.2 Geist;transition:background .16s ease',
                          step.done ? 'background:#EAF3EC;border:1px solid #CFE4D5;color:#3F6B4E' : 'background:#fff;border:1px solid #E8E1D9;color:#57504A'
                        )}
                      >
                        <span aria-hidden="true" style={s('width:16px;height:16px;border-radius:4px;flex:none;display:grid;place-items:center', step.done ? 'background:#3F6B4E;color:#fff' : 'background:#fff;border:1px solid #D8CFC5')}>
                          {step.done ? <Icon name="check" size={11} stroke={2.5} /> : null}
                        </span>
                        {step.label}
                      </Pressable>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={S('padding:10px 20px 20px')}>
              {p.people.some((x) => x.appId) ? (
                <div style={S('font:450 13px/1.5 Geist;color:#57504A')}>Everyone on your roster joined through your join link. They mark their own steps, listed below.</div>
              ) : (
                <EmptyState compact icon="users" title="No one on the roster yet" body="Students you accept or add on the People tab show up here." cta="Go to People" onCta={() => router.push(`/lead/${p.id}/people`)} />
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* volunteers who joined through the public link (cross-user) */}
      <PipelineMembers p={p} />
    </div>
  );
}

/* Per-kind details the volunteer needs to actually do the step. */
const STEP_FIELDS = {
  meeting: { link: { label: 'Meeting link', ph: 'https://meet.google.com/abc-defg-hij', required: true }, when: { label: 'When', ph: 'e.g. Tue, Oct 20 at 4 PM' } },
  form: { link: { label: 'Form link', ph: 'https://forms.gle/...', required: true }, due: { label: 'Due date', ph: 'e.g. Oct 25' } },
  training: { link: { label: 'Training link (optional)', ph: 'https://...', required: false }, when: { label: 'When', ph: 'e.g. Before your first shift' } },
  check: {},
};

function StepForm({ api, project, step }) {
  const [f, setF] = useState({
    label: step ? step.label : '',
    kind: step ? step.kind : 'meeting',
    required: step ? step.required !== false : true,
    note: step ? step.note || '' : '',
    link: step ? (step.link || '') : '',
    when: step ? (step.when || '') : '',
    due: step ? (step.due || '') : '',
  });
  const [err, setErr] = useState({});
  const cfg = STEP_FIELDS[f.kind] || {};

  const save = () => {
    const e = {};
    if (!f.label.trim()) e.label = 'Enter a name for the step.';
    const need = cfg.link && cfg.link.required;
    const link = f.link.trim();
    if (need && !link) e.link = 'Enter the link volunteers will open.';
    else if (cfg.link && link && !safeLink(link)) e.link = 'Enter a link that starts with https://';
    setErr(e);
    if (Object.keys(e).length) return;
    const payload = {
      label: f.label.trim(),
      kind: f.kind,
      required: f.required,
      note: f.note.trim(),
      link: cfg.link ? link : '',
      when: cfg.when ? f.when.trim() : '',
      due: cfg.due ? f.due.trim() : '',
    };
    if (step) updatePipelineStep(project.id, step.id, payload);
    else addPipelineStep(project.id, payload);
    api.close();
    toast({ title: step ? 'Step saved' : 'Step added', message: payload.label, tone: 'ok', timeout: 2000 });
  };

  return (
    <div>
      <Field label="Step" value={f.label} onChange={(v) => setF((x) => ({ ...x, label: v }))} placeholder="e.g. Join the Zoom briefing" maxLength={70} required error={err.label} />
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:end')}>
        <Select label="Type" value={f.kind} options={KIND_OPTS} onChange={(v) => setF((x) => ({ ...x, kind: v }))} />
        <label style={S('display:flex;align-items:center;gap:9px;min-height:44px;padding:0 4px;cursor:pointer;font:450 13px/1.3 Geist;color:#332D28')}>
          <input type="checkbox" checked={f.required} onChange={(e) => setF((x) => ({ ...x, required: e.target.checked }))} style={S('appearance:auto;-webkit-appearance:checkbox;width:16px;height:16px;flex:none;accent-color:#C2603C;cursor:pointer')} />
          Required before a shift
        </label>
      </div>
      {cfg.link || cfg.when || cfg.due ? (
        <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 180px;gap:14px;align-items:start')}>
          {cfg.link ? (
            <Field label={cfg.link.label} value={f.link} onChange={(v) => setF((x) => ({ ...x, link: v }))} placeholder={cfg.link.ph} maxLength={300} inputMode="url" error={err.link} />
          ) : <span />}
          {cfg.when ? (
            <Field label={cfg.when.label} value={f.when} onChange={(v) => setF((x) => ({ ...x, when: v }))} placeholder={cfg.when.ph} maxLength={40} />
          ) : cfg.due ? (
            <Field label={cfg.due.label} value={f.due} onChange={(v) => setF((x) => ({ ...x, due: v }))} placeholder={cfg.due.ph} maxLength={40} />
          ) : <span />}
        </div>
      ) : null}
      <div style={S('margin-top:14px')}>
        <Field label="Note for volunteers (optional)" value={f.note} onChange={(v) => setF((x) => ({ ...x, note: v }))} placeholder="e.g. Bring a photo ID" maxLength={140} />
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S(MODAL_SECONDARY)}>Cancel</Pressable>
        <Pressable label={step ? 'Save step' : 'Add step'} onClick={save} className={cx(H.primary, H.press)} style={S(MODAL_PRIMARY)}>
          {step ? 'Save step' : 'Add step'}
        </Pressable>
      </div>
    </div>
  );
}
