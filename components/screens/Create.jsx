'use client';

/* ==========================================================================
   Create.jsx — design screen: `isCreate` (new project wizard)
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, Field, Select, TextArea, Checkbox, Chip, EmptyState } from '../ui.jsx';
import { useSnapshot, update } from '../../lib/store.js';
import { openModal, confirmDialog, toast, menuFromEvent } from '../../lib/overlays.js';
import { createProject, perform } from '../../lib/db.js';
import { projectTemplates, PEXELS } from '../../lib/seed.js';
import {
  defaultDraft, generatedSessions, totalSlots, safetyComplete,
  CAUSE_OPTIONS, TERM_OPTIONS, VISIBILITY_OPTIONS, REPEAT_OPTIONS, AUDIENCE_OPTIONS, MISSION_MAX,
} from '../../lib/createDraft.js';

const MONO = "'Geist Mono',monospace";

const STEPS = [
  { label: 'Basics', desc: 'Name, mission, cause' },
  { label: 'Positions', desc: 'Roles and requirements' },
  { label: 'Schedule', desc: 'Sessions and safety' },
  { label: 'Review', desc: 'Publish settings' },
];

const COVERS = [PEXELS.reading2, PEXELS.food, PEXELS.trail, PEXELS.seniors, PEXELS.shelter, PEXELS.lead];

export default function Create() {
  const router = useRouter();
  const { state } = useSnapshot();
  const [draft, setDraft] = useState(() => state.drafts.create || defaultDraft());
  const [errors, setErrors] = useState({});
  const [publishing, setPublishing] = useState(false);

  // Autosave so a student can hand the draft to a sponsor before publishing.
  useEffect(() => {
    update(
      (st) => {
        st.drafts.create = draft;
      },
      { silent: true }
    );
  }, [draft]);

  const step = Math.min(4, Math.max(1, draft.step || 1));
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  function validate(n) {
    const e = {};
    if (n === 1) {
      if (!draft.name.trim()) e.name = 'Give the project a name.';
      if (!draft.site.trim()) e.site = 'Where does it happen?';
      if (!draft.mission.trim()) e.mission = 'One sentence on what happens and who it is for.';
      else if (draft.mission.length > MISSION_MAX) e.mission = `Trim it to ${MISSION_MAX} characters.`;
      if (draft.website.trim() && !/^https?:\/\/.+\..+/.test(draft.website.trim())) e.website = 'Use a full link starting with https://';
    }
    if (n === 2) {
      if (!draft.positions.length) e.positions = 'Add at least one position so students have something to apply for.';
    }
    if (n === 3) {
      if (!/[A-Za-z]{3}\s+\d{1,2}/.test(draft.firstSession)) e.firstSession = 'Use a date like “Aug 9”.';
      if (!/\d{1,2}:\d{2}\s*(?:to|-|–)\s*\d{1,2}:\d{2}/.test(draft.time)) e.time = 'Use a range like “10:00 to 12:00”.';
      if (!safetyComplete(draft)) e.safety = 'All three safety commitments are required before a sponsor will take you.';
    }
    setErrors(e);
    return !Object.keys(e).length;
  }

  function next() {
    if (!validate(step)) {
      toast({ title: 'Check the highlighted fields', tone: 'warn' });
      return;
    }
    setErrors({});
    set({ step: step + 1 });
    window.scrollTo(0, 0);
  }

  function goStep(n) {
    if (n > step && !validate(step)) {
      toast({ title: 'Finish this step first', tone: 'warn' });
      return;
    }
    setErrors({});
    set({ step: n });
    window.scrollTo(0, 0);
  }

  async function publish() {
    if (publishing) return;
    for (const n of [1, 2, 3]) {
      if (!validate(n)) {
        set({ step: n });
        toast({ title: `Step ${n} still needs attention`, tone: 'warn' });
        return;
      }
    }
    setPublishing(true);
    try {
      const project = await perform('create.publish', () => createProject({ ...draft, sessions: generatedSessions(draft) }));
      toast({ title: `${project.name} is live`, message: 'Sponsor requests are going out to vetted organizations near you.', tone: 'ok' });
      router.replace(`/lead/${project.id}/overview`);
    } catch (err) {
      if (err && err.code === 'OFFLINE') toast({ title: 'You are offline', message: 'Your draft is saved. Publish once you reconnect.', tone: 'danger' });
      else if (!err || err.code !== 'DUPLICATE') toast({ title: 'Could not publish', message: 'Try again in a moment.', tone: 'danger' });
    } finally {
      setPublishing(false);
    }
  }

  async function discard() {
    const ok = await confirmDialog({
      title: 'Discard this draft?',
      body: 'Everything you entered is deleted. This cannot be undone.',
      confirmLabel: 'Discard draft',
    });
    if (!ok) return;
    update((st) => {
      st.drafts.create = null;
    });
    setDraft(defaultDraft());
    toast({ title: 'Draft discarded', tone: 'ok' });
  }

  const steps = STEPS.map((x, i) => {
    const n = i + 1;
    return {
      n,
      label: x.label,
      desc: x.desc,
      bg: step === n ? '#1F1B18' : '#FFFFFF',
      color: step === n ? '#FFFFFF' : '#A9A097',
      border: step === n ? '#1F1B18' : '#E8E1D9',
      titleColor: step >= n ? '#1A1714' : '#A9A097',
    };
  });

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:28px 40px 96px;max-width:1100px')}>
      <Pressable
        label="Back to workspace"
        onClick={() => router.push('/lead')}
        className={H.toInk}
        style={S('font:500 13px/1 Geist;color:#8A8179;cursor:pointer;width:max-content')}
      >
        ← Back to workspace
      </Pressable>
      <h1 style={S('margin:16px 0 0;font:600 30px/1.06 Geist;letter-spacing:-0.04em')}>New project</h1>
      <div style={S('margin-top:8px;font:450 15px/1.5 Geist;color:#6B635C')}>
        Four steps. Saved as a draft as you go, so you can hand it to a sponsor before publishing.
      </div>

      <div className="vu-split" style={S('margin-top:26px;display:grid;grid-template-columns:250px 1fr;gap:28px;align-items:start')}>
        <div style={S('display:flex;flex-direction:column;gap:4px')}>
          {steps.map((st) => (
            <Pressable
              key={st.n}
              label={`Step ${st.n}: ${st.label}`}
              current={st.n === step ? 'step' : undefined}
              onClick={() => goStep(st.n)}
              className={cx(H.nav, H.press)}
              style={S('display:flex;align-items:flex-start;gap:11px;padding:12px;border-radius:11px;cursor:pointer;transition:background .16s ease')}
            >
              <div style={s('width:24px;height:24px;border-radius:8px;display:grid;place-items:center;flex:none', `border:1px solid ${st.border}`, `background:${st.bg}`, `color:${st.color}`, `font:600 11px/1 ${MONO}`)}>
                {st.n}
              </div>
              <div>
                <div style={s('font:500 13px/1.2 Geist', `color:${st.titleColor}`)}>{st.label}</div>
                <div style={S('margin-top:4px;font:450 11px/1.3 Geist;color:#A9A097')}>{st.desc}</div>
              </div>
            </Pressable>
          ))}
          <div style={S('margin-top:14px;padding:16px;border-radius:12px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S(`font:500 10px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Draft saved</div>
            <div style={S('margin-top:9px;font:450 12px/1.5 Geist;color:#6B635C')}>Autosaved a moment ago. Only you and invited co-leads can see this.</div>
            <Pressable label="Discard this draft" onClick={discard} className={H.link} style={S('margin-top:12px;font:500 12px/1 Geist;color:#A8482A;cursor:pointer')}>
              Discard draft
            </Pressable>
          </div>
        </div>

        <div>
          {step === 1 ? <Step1 d={draft} set={set} errors={errors} onNext={next} router={router} /> : null}
          {step === 2 ? <Step2 d={draft} set={set} errors={errors} onNext={next} onBack={() => goStep(1)} /> : null}
          {step === 3 ? <Step3 d={draft} set={set} errors={errors} onNext={next} onBack={() => goStep(2)} /> : null}
          {step === 4 ? <Step4 d={draft} publishing={publishing} onPublish={publish} onBack={() => goStep(3)} account={state.account} /> : null}
        </div>
      </div>
    </div>
  );
}

function Card({ children }) {
  return <div className="vu-screen" style={S('padding:26px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>{children}</div>;
}

function NextBtn({ label, onClick, busy }) {
  return (
    <Pressable
      label={label}
      disabled={busy}
      onClick={onClick}
      className={H.press}
      style={S('display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:none;padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 15px/1 Geist;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);transition:background .16s ease, transform .16s ease')}
    >
      {busy ? <span className="vu-spin" /> : <span aria-hidden="true" style={S('font-size:11px;opacity:.9')}>▷</span>}
      {busy ? 'Publishing' : label}
    </Pressable>
  );
}

function BackBtn({ onClick }) {
  return (
    <Pressable label="Back" onClick={onClick} className={H.toInk} style={S('font:500 14px/1 Geist;color:#8A8179;cursor:pointer')}>
      Back
    </Pressable>
  );
}

function Step1({ d, set, errors, onNext, router }) {
  function pickCover() {
    openModal({
      title: 'Cover photo',
      subtitle: 'This is the first thing a student sees on your recruiting page.',
      size: 'wide',
      Body: function CoverBody({ api }) {
        return (
          <div className="vu-3col" style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:12px')}>
            {COVERS.map((src) => (
              <Pressable
                key={src}
                label="Use this cover photo"
                onClick={() => {
                  set({ cover: src });
                  api.close();
                  toast({ title: 'Cover updated', tone: 'ok', timeout: 2000 });
                }}
                className={cx(H.card, H.press)}
                style={s('height:110px;border-radius:12px;overflow:hidden;cursor:pointer', `border:2px solid ${d.cover === src ? '#C2603C' : 'transparent'}`)}
              >
                <ImageSlot src={src} shape="rounded" radius={10} placeholder="cover" />
              </Pressable>
            ))}
          </div>
        );
      },
    });
  }

  return (
    <Card>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>Step 1 of 4</div>
      <h2 style={S('margin:14px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>The basics</h2>
      <div className="vu-2col-keep" style={S('margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
        <Field label="Project name" value={d.name} onChange={(v) => set({ name: v })} bg="#FCFAF8" fs={14} maxLength={60} required error={errors.name} />
        <Select label="Cause area" value={d.cause} onChange={(v) => set({ cause: v })} options={CAUSE_OPTIONS} bg="#FCFAF8" fs={14} />
        <Field label="Site or location" value={d.site} onChange={(v) => set({ site: v })} bg="#FCFAF8" fs={14} maxLength={90} required error={errors.site} />
        <Field label="Website or social link" value={d.website} onChange={(v) => set({ website: v })} placeholder="Optional" bg="#FCFAF8" fs={14} type="url" error={errors.website} />
      </div>
      <div style={S('margin-top:20px')}>
        <TextArea label="Mission" value={d.mission} onChange={(v) => set({ mission: v })} maxLength={MISSION_MAX} counter minHeight={84} bg="#FCFAF8" fs={14} error={errors.mission} placeholder="One sentence on what happens and who it is for." />
      </div>
      <div style={S('margin-top:20px')}>
        <TextArea label="Short bio for the project page" value={d.bio} onChange={(v) => set({ bio: v })} maxLength={400} minHeight={70} bg="#FCFAF8" fs={14} placeholder="What a new volunteer should know before applying." />
      </div>
      <div style={S('margin-top:20px')}>
        <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Track record so far</div>
        <div style={S('margin-top:6px;font:450 12px/1.5 Geist;color:#8A8179')}>Run this before? Log what you have already done so your page shows it from day one. Leave blank if you are just starting out.</div>
        <div className="vu-2col-keep" style={S('margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
          <Field label="Events hosted so far" value={d.eventsHosted} onChange={(v) => set({ eventsHosted: v.replace(/\D/g, '').slice(0, 5) })} placeholder="0" bg="#FCFAF8" fs={14} inputMode="numeric" />
          <Field label="Volunteers reached, roughly" value={d.approxVolunteers} onChange={(v) => set({ approxVolunteers: v.replace(/\D/g, '').slice(0, 6) })} placeholder="0" bg="#FCFAF8" fs={14} inputMode="numeric" />
        </div>
      </div>
      <div className="vu-3col" style={S('margin-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px')}>
        <div>
          <div style={S('font:500 12px/1 Geist;color:#57504A')}>Cover photo</div>
          <Pressable label="Change the cover photo" onClick={pickCover} className={cx(H.link, H.press)} style={S('margin-top:8px;display:block;height:96px;border-radius:11px;overflow:hidden;cursor:pointer')}>
            <ImageSlot src={d.cover} shape="rounded" radius={11} placeholder="cover" />
          </Pressable>
        </div>
        <Select label="Term length" value={d.term} onChange={(v) => set({ term: v })} options={TERM_OPTIONS} bg="#FCFAF8" fs={14} />
        <Select label="Visibility" value={d.visibility} onChange={(v) => set({ visibility: v })} options={VISIBILITY_OPTIONS} bg="#FCFAF8" fs={14} />
      </div>
      <div className="vu-stack vu-stack-gap" style={S('margin-top:24px;display:flex;align-items:center;gap:12px')}>
        <NextBtn label="Continue to positions" onClick={onNext} />
        <Pressable
          label="Save and exit"
          onClick={() => {
            toast({ title: 'Draft saved', message: 'Pick it up from Lead whenever you are ready.', tone: 'ok' });
            router.push('/lead');
          }}
          className={H.toInk}
          style={S('font:500 14px/1 Geist;color:#8A8179;cursor:pointer')}
        >
          Save and exit
        </Pressable>
      </div>
    </Card>
  );
}

function Step2({ d, set, errors, onNext, onBack }) {
  function editPosition(index) {
    const existing = index === null ? null : d.positions[index];
    openModal({
      title: existing ? `Edit ${existing.t}` : 'Add a position',
      Body: function PosBody({ api }) {
        return (
          <DraftPositionForm
            api={api}
            pos={existing}
            onSave={(next) => {
              if (index === null) set({ positions: [...d.positions, next] });
              else set({ positions: d.positions.map((p, i) => (i === index ? next : p)) });
            }}
            onDelete={index === null ? null : () => set({ positions: d.positions.filter((_, i) => i !== index) })}
          />
        );
      },
    });
  }

  function useTemplate(e) {
    menuFromEvent(
      e,
      projectTemplates.map((t) => ({ key: t.id, label: `${t.t} — ${t.m}`, icon: '◈' })),
      (key) => {
        const t = projectTemplates.find((x) => x.id === key);
        if (!t) return;
        set({
          positions: t.positions.map((name) => ({ t: name, slots: name === 'Tutor' || name === 'Crew member' ? 8 : 1, age: '13+', train: 'None', commit: '1 hr weekly', note: '', requirements: [] })),
          cause: t.cause,
        });
        toast({ title: `${t.t} template applied`, message: 'Adjust the slots and requirements to fit.', tone: 'ok' });
      }
    );
  }

  return (
    <Card>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>Step 2 of 4</div>
      <h2 style={S('margin:14px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Who you need</h2>
      <div style={S('margin-top:8px;font:450 14px/1.5 Geist;color:#6B635C')}>Each position becomes an application form and a slot on every session.</div>

      <div className="vu-table-wrap" style={S('margin-top:20px;border-radius:12px;border:1px solid #F1EBE4;overflow:hidden')}>
        <div>
          <div style={S(`display:grid;grid-template-columns:1.4fr .8fr .8fr 1.1fr 40px;gap:12px;padding:12px 16px;background:#FCFAF8;border-bottom:1px solid #F1EBE4;font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>
            <div>Position</div><div>Slots</div><div>Min age</div><div>Training</div><div />
          </div>
          {d.positions.length ? (
            d.positions.map((p, i) => (
              <div key={`${p.t}-${i}`} className={H.row} style={S('display:grid;grid-template-columns:1.4fr .8fr .8fr 1.1fr 40px;gap:12px;padding:14px 16px;border-bottom:1px solid #F1EBE4;align-items:center;transition:background .16s ease')}>
                <div style={S('font:500 13px/1 Geist')}>{p.t}</div>
                <div style={S('font:450 13px/1 Geist;color:#57504A')}>0 / {p.slots}</div>
                <div style={S('font:450 13px/1 Geist;color:#57504A')}>{p.age}</div>
                <div style={S('font:450 13px/1 Geist;color:#57504A')}>{p.train}</div>
                <Pressable
                  label={`Options for ${p.t}`}
                  onClick={() => editPosition(i)}
                  className={cx(H.toInk, H.press)}
                  style={S('font:500 13px/1 Geist;color:#A9A097;cursor:pointer;text-align:center')}
                >
                  ···
                </Pressable>
              </div>
            ))
          ) : (
            <div style={S('padding:24px 16px;text-align:center;font:450 13px/1.55 Geist;color:#8A8179')}>
              No positions yet. Add at least one so students have something to apply for.
            </div>
          )}
        </div>
      </div>
      {errors.positions ? <div className="vu-err">{errors.positions}</div> : null}

      <div style={S('margin-top:16px;display:flex;gap:10px;flex-wrap:wrap')}>
        <Pressable
          label="Add position"
          onClick={() => editPosition(null)}
          className={cx(H.secondary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#1A1714;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
        >
          Add position
        </Pressable>
        <Pressable
          label="Copy positions from a template"
          expanded={false}
          onClick={useTemplate}
          className={cx(H.secondary, H.press)}
          style={S('display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E4DDD4;background:#fff;font:600 13px/1 Geist;color:#1A1714;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
        >
          Copy from a template
        </Pressable>
      </div>

      <div id="cr-aud" style={S(`margin-top:24px;font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>Who should apply</div>
      <div role="group" aria-labelledby="cr-aud" style={S('margin-top:14px;display:flex;flex-wrap:wrap;gap:8px')}>
        {AUDIENCE_OPTIONS.map((a) => (
          <Chip
            key={a}
            label={a}
            role="checkbox"
            on={d.audience.includes(a)}
            py={9}
            px={13}
            fs={13}
            onClick={() => set({ audience: d.audience.includes(a) ? d.audience.filter((x) => x !== a) : [...d.audience, a] })}
          />
        ))}
      </div>

      <div className="vu-stack vu-stack-gap" style={S('margin-top:24px;display:flex;align-items:center;gap:12px')}>
        <NextBtn label="Continue to schedule" onClick={onNext} />
        <BackBtn onClick={onBack} />
      </div>
    </Card>
  );
}

function DraftPositionForm({ api, pos, onSave, onDelete }) {
  const [f, setF] = useState({
    t: pos ? pos.t : '',
    slots: pos ? String(pos.slots) : '2',
    age: pos ? pos.age : '13+',
    train: pos ? pos.train : 'None',
    commit: pos ? pos.commit : '1 hr weekly',
    note: pos ? pos.note : '',
    requirements: pos ? (pos.requirements || []).slice() : [],
  });
  const [err, setErr] = useState({});
  const REQ = ['Guardian consent', 'Media release', 'Food handling', 'Reading training', 'Transport form'];
  return (
    <div>
      <Field label="Position name" value={f.t} onChange={(v) => setF((x) => ({ ...x, t: v }))} maxLength={40} required error={err.t} />
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Slots" value={f.slots} onChange={(v) => setF((x) => ({ ...x, slots: v.replace(/\D/g, '').slice(0, 3) }))} inputMode="numeric" error={err.slots} />
        <Select label="Minimum age" value={f.age} options={['13+', '14+', '15+', '16+', '18+']} onChange={(v) => setF((x) => ({ ...x, age: v }))} />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Select label="Training" value={f.train} options={['None', 'Required · 15 min', 'Required · 30 min', 'Required · 45 min', 'Food handling']} onChange={(v) => setF((x) => ({ ...x, train: v }))} />
        <Select label="Commitment" value={f.commit} options={['1 hr monthly', '1 hr weekly', '2 hrs weekly', '2.5 hrs weekly', '4 hrs weekly']} onChange={(v) => setF((x) => ({ ...x, commit: v }))} />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="What they actually do" value={f.note} onChange={(v) => setF((x) => ({ ...x, note: v }))} maxLength={90} />
      </div>
      <div style={S('margin-top:16px')}>
        <div style={S('font:500 12px/1 Geist;color:#57504A')}>Requirements</div>
        <div style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
          {REQ.map((r) => (
            <Chip
              key={r}
              label={r}
              role="checkbox"
              py={8}
              px={12}
              fs={12}
              on={f.requirements.includes(r)}
              onClick={() => setF((x) => ({ ...x, requirements: x.requirements.includes(r) ? x.requirements.filter((y) => y !== r) : [...x.requirements, r] }))}
            />
          ))}
        </div>
      </div>
      <div style={S('margin-top:18px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap')}>
        {onDelete ? (
          <Pressable
            label="Remove this position"
            onClick={() => {
              onDelete();
              api.close();
              toast({ title: 'Position removed', tone: 'ok', timeout: 2200 });
            }}
            className={cx(H.danger, H.press)}
            style={S('display:inline-flex;align-items:center;padding:0 14px;height:40px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;font:600 13px/1 Geist;color:#A8482A;cursor:pointer')}
          >
            Remove
          </Pressable>
        ) : (
          <span />
        )}
        <div style={S('display:flex;gap:10px')}>
          <Pressable label="Cancel" onClick={() => api.close()} className={cx(H.secondary, H.press)} style={S('display:inline-flex;align-items:center;padding:0 16px;height:40px;border-radius:11px;border:1px solid #E4DDD4;background:#fff;font:600 14px/1 Geist;cursor:pointer')}>
            Cancel
          </Pressable>
          <Pressable
            label={pos ? 'Save position' : 'Add position'}
            onClick={() => {
              const e = {};
              if (!f.t.trim()) e.t = 'Give the position a name.';
              const n = Number(f.slots);
              if (!n || n < 1 || n > 200) e.slots = 'Between 1 and 200.';
              setErr(e);
              if (Object.keys(e).length) return;
              onSave({ ...f, t: f.t.trim(), slots: n });
              api.close();
              toast({ title: pos ? 'Position updated' : `${f.t.trim()} added`, tone: 'ok', timeout: 2200 });
            }}
            className={cx(H.primary, H.press)}
            style={S('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;background:linear-gradient(180deg,#D2775B 0%,#C2603C 100%);color:#fff;font:600 14px/1 Geist;cursor:pointer')}
          >
            {pos ? 'Save' : 'Add'}
          </Pressable>
        </div>
      </div>
    </div>
  );
}

function Step3({ d, set, errors, onNext, onBack }) {
  const sessions = generatedSessions(d);
  return (
    <Card>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>Step 3 of 4</div>
      <h2 style={S('margin:14px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Schedule and safety</h2>
      <div className="vu-3col" style={S('margin-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px')}>
        <Select label="Repeats" value={d.repeats} onChange={(v) => set({ repeats: v })} options={REPEAT_OPTIONS} bg="#FCFAF8" fs={14} />
        <Field label="Time" value={d.time} onChange={(v) => set({ time: v })} bg="#FCFAF8" fs={14} error={errors.time} />
        <Field label="First session" value={d.firstSession} onChange={(v) => set({ firstSession: v })} bg="#FCFAF8" fs={14} error={errors.firstSession} />
      </div>
      <div style={S('margin-top:20px;border-radius:12px;border:1px solid #F1EBE4;overflow:hidden')}>
        <div style={S(`padding:12px 16px;background:#FCFAF8;border-bottom:1px solid #F1EBE4;font:500 10px/1 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#A9A097`)}>Generated sessions</div>
        {sessions.map((x, i) => (
          <div key={`${x.d}-${i}`} style={S('padding:13px 16px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
            <div style={S('font:450 13px/1 Geist;color:#332D28')}>
              {x.d} · {x.t}
            </div>
            <div style={S(`font:500 12px/1 ${MONO};color:#8A8179`)}>{d.crewTarget} slots</div>
          </div>
        ))}
      </div>
      <div style={S(`margin-top:22px;font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>Safety and consent</div>
      <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:12px')}>
        <Checkbox checked={d.safety.staff} onChange={(v) => set({ safety: { ...d.safety, staff: v } })} label="A staff member from the sponsor is present at every session" />
        <Checkbox checked={d.safety.consent} onChange={(v) => set({ safety: { ...d.safety, consent: v } })} label="Guardian consent collected for anyone under 16" />
        <Checkbox checked={d.safety.pair} onChange={(v) => set({ safety: { ...d.safety, pair: v } })} label="Never fewer than two volunteers on site" />
      </div>
      {errors.safety ? <div className="vu-err">{errors.safety}</div> : null}
      <div className="vu-stack vu-stack-gap" style={S('margin-top:24px;display:flex;align-items:center;gap:12px')}>
        <NextBtn label="Continue to review" onClick={onNext} />
        <BackBtn onClick={onBack} />
      </div>
    </Card>
  );
}

function Step4({ d, publishing, onPublish, onBack, account }) {
  const slots = totalSlots(d);
  const sessions = generatedSessions(d);
  const safe = safetyComplete(d);
  return (
    <Card>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>Step 4 of 4</div>
      <h2 style={S('margin:14px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Review and publish</h2>
      <div className="vu-split" style={S('margin-top:20px;display:grid;grid-template-columns:260px 1fr;gap:20px;align-items:start')}>
        <div style={S('border-radius:14px;border:1px solid #F1EBE4;background:#FCFAF8;padding:14px')}>
          <div style={S('height:120px;border-radius:10px;overflow:hidden')}>
            <ImageSlot src={d.cover} shape="rounded" radius={10} placeholder="cover" />
          </div>
          <div style={S('margin-top:12px;font:600 15px/1.25 Geist;letter-spacing:-0.02em')}>{d.name}</div>
          <div style={S('margin-top:6px;font:450 12px/1.4 Geist;color:#8A8179')}>
            Led by {account.firstName} {account.lastName ? `${account.lastName[0]}.` : ''} · Grade {account.grade}
          </div>
          <div style={S(`margin-top:10px;font:500 11px/1 ${MONO};color:#C2603C`)}>0 of {slots} crew</div>
        </div>
        <div style={S('border-radius:12px;border:1px solid #F1EBE4;overflow:hidden')}>
          {[
            ['Sponsor', 'Requests go out on publish'],
            ['Positions', `${d.positions.length} defined, ${slots} slots`],
            ['Sessions', `${sessions.length} ${/one time/i.test(d.repeats) ? 'one off' : 'weekly'}`],
            ['Applications', d.audience.length ? d.audience.join(', ') : 'Open to everyone'],
          ].map(([l, v]) => (
            <div key={l} style={S('padding:13px 16px;border-bottom:1px solid #F1EBE4;display:flex;justify-content:space-between;gap:12px;font:450 13px/1 Geist;color:#57504A')}>
              <span>{l}</span>
              <span style={S('color:#1A1714;font-weight:500')}>{v}</span>
            </div>
          ))}
          <div style={S('padding:13px 16px;display:flex;justify-content:space-between;gap:12px;font:450 13px/1 Geist;color:#57504A')}>
            <span>Safety plan</span>
            <span style={s('font-weight:500', `color:${safe ? '#3F6B4E' : '#8A5A20'}`)}>{safe ? 'Ready for sponsor' : 'Needs attention'}</span>
          </div>
        </div>
      </div>
      <div className="vu-stack vu-stack-gap" style={S('margin-top:22px;display:flex;align-items:center;gap:12px')}>
        <NextBtn label="Publish and start recruiting" onClick={onPublish} busy={publishing} />
        <BackBtn onClick={onBack} />
      </div>
    </Card>
  );
}
