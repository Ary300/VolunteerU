'use client';

/* ==========================================================================
   PipelineTab.jsx, the steps every volunteer finishes before their first shift
   Leads define the steps (a briefing call, a consent form, role training)
   and mark each volunteer through them.
   ========================================================================== */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, cx, H } from '../../lib/style.js';
import { Pressable, Field, Select, EmptyState, Icon, Button } from '../ui.jsx';
import { C, F, R } from '../../lib/tokens.js';
import { openModal, confirmDialog, toast } from '../../lib/overlays.js';
import {
  pipelineFor, pipelineProgress, addPipelineStep, updatePipelineStep, removePipelineStep, togglePipelineStep,
} from '../../lib/db.js';
import { PipelineMembers, ProgressRow, safeLink } from './CrossMembers.jsx';

const H2 = `margin:0;font:650 22px/1.15 ${F.display};letter-spacing:-0.02em;color:${C.ink}`;
const META = `font:400 14px/1.4 ${F.body};color:${C.ink2}`;
const SMALL = `font:400 13px/1.45 ${F.body};color:${C.ink2}`;
const RULE = `border-bottom:1px solid ${C.line}`;
const ROW_BTN = `display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;height:36px;border-radius:${R.control};border:1px solid ${C.line2};background:#fff;font:600 13px/1 ${F.body};cursor:pointer;white-space:nowrap`;
const KIND = {
  meeting: { l: 'Meeting', icon: 'calendar' },
  form: { l: 'Form', icon: 'file' },
  training: { l: 'Training', icon: 'award' },
  check: { l: 'Check', icon: 'check' },
};
const KIND_OPTS = Object.entries(KIND).map(([v, x]) => ({ v, l: x.l }));

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
    <div style={S('margin-top:32px;display:flex;flex-direction:column;gap:56px')}>
      <section aria-labelledby="pl-steps">
        <div className="vu-sec-head" style={S('flex-wrap:wrap;align-items:flex-start')}>
          <div style={S('min-width:0;max-width:640px')}>
            <h2 id="pl-steps" style={S(H2)}>Steps before the first shift</h2>
            <p style={S(`margin:6px 0 0;${META}`)}>
              Volunteers you accept work through these. Mark each one done below as people finish it.
            </p>
          </div>
          <Button variant="primary" size="sm" icon="plus" onClick={() => editStep(null)}>Add step</Button>
        </div>
        {steps.length ? (
          <ol aria-label={`${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`} style={S(`margin:20px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
            {steps.map((step, i) => {
              const k = KIND[step.kind] || KIND.check;
              const href = safeLink(step.link);
              const needsLink = STEP_FIELDS[step.kind] && STEP_FIELDS[step.kind].link && STEP_FIELDS[step.kind].link.required;
              const when = step.kind === 'form' ? (step.due ? `Due ${step.due}` : '') : step.when;
              return (
                <li key={step.id} style={S(`padding:18px 0;${RULE}`)}>
                  <div className="vu-stack vu-stack-gap" style={S('display:flex;align-items:flex-start;gap:16px')}>
                  <div style={S('display:flex;align-items:flex-start;gap:16px;min-width:0;flex:1')}>
                    <div aria-hidden="true" style={S(`width:20px;flex:none;font:600 16px/1.3 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>{i + 1}</div>
                    <div style={S('min-width:0;flex:1')}>
                      <div style={S(`font:600 16px/1.3 ${F.body};color:${C.ink}`)}>{step.label}</div>
                      <p style={S(`margin:4px 0 0;${SMALL}`)}>
                        <span>{k.l}</span>
                        <span className="vu-sep" aria-hidden="true">{' \u00b7 '}</span>
                        <span style={step.required ? S(`color:${C.ink};font-weight:600`) : undefined}>{step.required ? 'Required' : 'Optional'}</span>
                        {when ? (
                          <>
                            <span className="vu-sep" aria-hidden="true">{' \u00b7 '}</span>
                            <span>{when}</span>
                          </>
                        ) : null}
                      </p>
                      {step.note ? <p style={S(`margin:8px 0 0;font:400 14px/1.5 ${F.body};color:${C.ink}`)}>{step.note}</p> : null}
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className={cx('vu-link', H.link)} style={S(`margin-top:8px;display:inline-flex;align-items:center;gap:6px;max-width:100%;font:500 14px/1.4 ${F.body};color:${C.ink};text-decoration:underline;text-underline-offset:3px`)}>
                          <Icon name="external" size={14} />
                          <span className="vu-trunc">{step.link}</span>
                        </a>
                      ) : needsLink ? (
                        <div style={S(`margin-top:8px;display:flex;align-items:flex-start;gap:6px;font:500 13px/1.45 ${F.body};color:${C.emberDeep}`)}>
                          <span style={S('flex:none;margin-top:1px')}><Icon name="alert" size={14} /></span>
                          No link yet. Edit the step to add one so volunteers can do it.
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div style={S('display:flex;gap:4px;align-items:center;flex:none')}>
                    <Pressable label={`Edit ${step.label}`} onClick={() => editStep(step)} className={cx('vu-btn', 'vu-btn-outline', H.press)} style={S(`${ROW_BTN};color:${C.ink}`)}>Edit</Pressable>
                    <Pressable
                      label={`Remove ${step.label}`}
                      onClick={async () => {
                        const ok = await confirmDialog({ title: 'Remove this step?', body: `"${step.label}" comes off the list for every volunteer.`, confirmLabel: 'Remove step' });
                        if (ok) { removePipelineStep(p.id, step.id); toast({ title: 'Step removed', message: step.label, tone: 'ok' }); }
                      }}
                      title={`Remove ${step.label}`}
                      className={cx('vu-iconbtn-sm', H.press)}
                      style={S('width:36px;height:36px;cursor:pointer')}
                    >
                      <Icon name="trash" size={18} />
                    </Pressable>
                  </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState compact icon="list" title="No steps yet" body="Add a briefing, a consent form or training for before the first shift." cta="Add step" onCta={() => editStep(null)} />
        )}
      </section>

      {/* per-volunteer progress */}
      {steps.length ? (
        <section aria-labelledby="pl-progress">
          <h2 id="pl-progress" style={S(H2)}>Progress</h2>
          <p style={S(`margin:6px 0 0;${META}`)}>Mark a step done when someone finishes it.</p>
          {roster.length ? (
            <ul style={S(`margin:16px 0 0;padding:0;list-style:none;border-top:1px solid ${C.line}`)}>
              {roster.map((person) => {
                const prog = pipelineProgress(p, person);
                return (
                  <ProgressRow
                    key={person.id}
                    name={person.n}
                    ready={prog.ready}
                    cleared={prog.cleared}
                    total={prog.total}
                    steps={prog.steps}
                    onToggle={(step) => {
                      togglePipelineStep(p.id, person.id, step.id);
                      toast({ title: step.done ? 'Marked not done' : 'Marked done', message: `${step.label}, ${person.n}`, tone: 'ok', timeout: 1800 });
                    }}
                  />
                );
              })}
            </ul>
          ) : (
            <div style={S(`margin-top:16px;border-top:1px solid ${C.line}`)}>
              {p.people.some((x) => x.appId) ? (
                <p style={S(`margin:14px 0 0;${META}`)}>Everyone on your roster joined through your join link. They mark their own steps, listed below.</p>
              ) : (
                <EmptyState compact icon="users" title="No one on the roster yet" body="Students you accept or add on the People tab show up here." cta="Go to People" onCta={() => router.push(`/lead/${p.id}/people`)} />
              )}
            </div>
          )}
        </section>
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
        <label style={S(`display:flex;align-items:center;gap:10px;min-height:46px;padding:0 2px;cursor:pointer;font:500 14px/1.3 ${F.body};color:${C.ink}`)}>
          <input type="checkbox" checked={f.required} onChange={(e) => setF((x) => ({ ...x, required: e.target.checked }))} style={S(`appearance:auto;-webkit-appearance:checkbox;width:16px;height:16px;flex:none;margin:0;accent-color:${C.ink};cursor:pointer`)} />
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
      <div style={S('margin-top:20px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap')}>
        <Button variant="outline" onClick={() => api.close()}>Cancel</Button>
        <Button variant="primary" onClick={save}>{step ? 'Save step' : 'Add step'}</Button>
      </div>
    </div>
  );
}
