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
import { createProject, perform, verifiedHours, canCreateProject, projectBlockingCreation } from '../../lib/db.js';
import { projectTemplates, PEXELS } from '../../lib/seed.js';
import {
  defaultDraft, generatedSessions, totalSlots, safetyComplete,
  CAUSE_OPTIONS, TERM_OPTIONS, VISIBILITY_OPTIONS, REPEAT_OPTIONS, AUDIENCE_OPTIONS, MISSION_MAX,
  ORG_TYPES, TASK_KINDS,
} from '../../lib/createDraft.js';

const MONO = "'Geist Mono',monospace";

const STEP_SETS = {
  volunteering: [
    { label: 'Basics', desc: 'Type, mission, cause' },
    { label: 'Positions', desc: 'Roles and requirements' },
    { label: 'Schedule', desc: 'Sessions, safety, pipeline' },
    { label: 'Review', desc: 'Publish settings' },
  ],
  team: [
    { label: 'Basics', desc: 'Type, mission, cause' },
    { label: 'Roles', desc: 'Roles and briefings' },
    { label: 'Tasks', desc: 'Starter task board' },
    { label: 'Review', desc: 'Publish settings' },
  ],
};

const KIND_LABEL = { meeting: 'Meeting', form: 'Form', training: 'Training', check: 'Check' };

const COVERS = [PEXELS.reading2, PEXELS.food, PEXELS.trail, PEXELS.seniors, PEXELS.shelter, PEXELS.lead];

export default function Create() {
  const router = useRouter();
  const { state } = useSnapshot();
  const [draft, setDraft] = useState(() => state.drafts.create || defaultDraft());
  const [errors, setErrors] = useState({});
  const [publishing, setPublishing] = useState(false);

  // Gate: you can only start a new project once every project you already run
  // has a verified event. Send blocked founders back to the workspace.
  useEffect(() => {
    if (!canCreateProject()) {
      const blocker = projectBlockingCreation();
      toast({
        title: 'Finish your current project first',
        message: blocker
          ? `${blocker.name} has no verified events yet. Run a session and post attendance before starting another.`
          : 'Run a session and post attendance on your current project first.',
        tone: 'warn',
        timeout: 6000,
      });
      router.replace('/lead');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const isTeam = draft.orgType === 'team';
  const STEPS = STEP_SETS[isTeam ? 'team' : 'volunteering'];
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const hasHours = verifiedHours() > 0;

  function validate(n) {
    const e = {};
    if (n === 1) {
      if (!draft.name.trim()) e.name = 'Give the project a name.';
      if (!draft.site.trim()) e.site = 'Where does it happen?';
      if (!draft.mission.trim()) e.mission = 'One sentence on what happens and who it is for.';
      else if (draft.mission.length > MISSION_MAX) e.mission = `Trim it to ${MISSION_MAX} characters.`;
      if (draft.website.trim() && !/^https?:\/\/.+\..+/.test(draft.website.trim())) e.website = 'Use a full link starting with https://';
      // Light QC: a founder should have done a little volunteering first. We
      // waive it automatically if they already have verified hours in-app.
      if (!hasHours && draft.founderExperience.trim().length < 12) {
        e.founderExperience = 'A sentence or two about volunteering you have done. This is all we ask.';
      }
    }
    if (n === 2) {
      if (isTeam) {
        if (!draft.teamRoles.some((r) => r.name && r.name.trim())) e.teamRoles = 'Add at least one role so members know what they are joining.';
      } else if (!draft.positions.length) {
        e.positions = 'Add at least one position so students have something to apply for.';
      }
    }
    if (n === 3 && !isTeam) {
      if (!/[A-Za-z]{3}\s+\d{1,2}/.test(draft.firstSession)) e.firstSession = 'Use a date like “Aug 9”.';
      if (!/\d{1,2}:\d{2}\s*(?:to|-|–)\s*\d{1,2}:\d{2}/.test(draft.time)) e.time = 'Use a range like “10:00 to 12:00”.';
      if (!safetyComplete(draft)) e.safety = 'All three safety commitments are required before you can publish.';
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
      const payload = isTeam
        ? { ...draft, positions: [], sessions: [] }
        : { ...draft, sessions: generatedSessions(draft) };
      const project = await perform('create.publish', () => createProject(payload));
      toast({
        title: `${project.name} is live`,
        message: isTeam ? 'Share the join link and start assigning tasks.' : 'Share your join link to recruit volunteers — you can request verification anytime.',
        tone: 'ok',
      });
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
          {step === 1 ? <Step1 d={draft} set={set} errors={errors} onNext={next} router={router} hasHours={hasHours} /> : null}
          {step === 2 && !isTeam ? <Step2 d={draft} set={set} errors={errors} onNext={next} onBack={() => goStep(1)} /> : null}
          {step === 2 && isTeam ? <Step2Team d={draft} set={set} errors={errors} onNext={next} onBack={() => goStep(1)} /> : null}
          {step === 3 && !isTeam ? <Step3 d={draft} set={set} errors={errors} onNext={next} onBack={() => goStep(2)} /> : null}
          {step === 3 && isTeam ? <Step3Team d={draft} set={set} errors={errors} onNext={next} onBack={() => goStep(2)} /> : null}
          {step === 4 ? <Step4 d={draft} publishing={publishing} onPublish={publish} onBack={() => goStep(3)} account={state.account} isTeam={isTeam} /> : null}
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

function Step1({ d, set, errors, onNext, router, hasHours }) {
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

      <div style={S(`margin-top:22px;font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>What kind of project is this?</div>
      <div className="vu-2col-keep" style={S('margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px')}>
        {ORG_TYPES.map((o) => {
          const on = d.orgType === o.id;
          return (
            <Pressable
              key={o.id}
              label={`${o.label}: ${o.tagline}`}
              onClick={() => set({ orgType: o.id })}
              className={cx(H.card, H.press)}
              style={s(
                'text-align:left;padding:16px;border-radius:14px;cursor:pointer;transition:border-color .16s ease, background .16s ease',
                `border:1.5px solid ${on ? '#C2603C' : '#E8E1D9'}`,
                `background:${on ? '#FAF6F3' : '#fff'}`
              )}
            >
              <div style={S('display:flex;align-items:center;gap:10px')}>
                <div style={s('width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:none;font-size:17px', `background:${on ? '#C2603C' : '#F1EBE4'}`, `color:${on ? '#fff' : '#8A8179'}`)}>{o.icon}</div>
                <div style={S('min-width:0')}>
                  <div style={S('font:600 15px/1.2 Geist;letter-spacing:-0.02em;color:#1A1714')}>{o.label}</div>
                  <div style={S(`margin-top:3px;font:500 11px/1.2 ${MONO};color:#C2603C`)}>{o.tagline}</div>
                </div>
                <div style={s('margin-left:auto;width:20px;height:20px;border-radius:50%;flex:none;display:grid;place-items:center;font:600 11px/1 Geist', `border:1.5px solid ${on ? '#C2603C' : '#D8D0C7'}`, `background:${on ? '#C2603C' : '#fff'}`, 'color:#fff')}>{on ? '✓' : ''}</div>
              </div>
              <div style={S('margin-top:11px;font:450 12.5px/1.5 Geist;color:#57504A')}>{o.blurb}</div>
              <div style={S('margin-top:8px;font:450 11px/1.4 Geist;color:#A9A097')}>e.g. {o.examples}</div>
            </Pressable>
          );
        })}
      </div>

      <div style={S('margin-top:20px')}>
        <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:#A9A097`)}>Who runs it</div>
        <div style={S('margin-top:10px;display:flex;gap:8px;flex-wrap:wrap')}>
          {[
            { k: 'student', t: 'Student-led', d: 'You and other students run it' },
            { k: 'official', t: 'Registered nonprofit', d: 'An established organization' },
          ].map((o) => {
            const on = (d.orgClass || 'student') === o.k;
            return (
              <Pressable
                key={o.k}
                role="radio"
                aria-checked={on}
                label={o.t}
                onClick={() => set({ orgClass: o.k })}
                className={cx(H.press)}
                style={s(
                  'flex:1;min-width:200px;text-align:left;padding:12px 14px;border-radius:12px;cursor:pointer;transition:border-color .16s ease, background .16s ease',
                  `border:1.5px solid ${on ? '#C2603C' : '#E8E1D9'}`,
                  `background:${on ? '#FAF6F3' : '#fff'}`
                )}
              >
                <div style={S('font:600 14px/1.2 Geist;color:#1A1714')}>{o.t}</div>
                <div style={S('margin-top:4px;font:450 12px/1.4 Geist;color:#8A8179')}>{o.d}</div>
              </Pressable>
            );
          })}
        </div>
        <div className="vu-hint" style={S('margin-top:7px;font:450 12px/1.5 Geist;color:#8A8179')}>Volunteers can filter for student-led projects or registered nonprofits on Discover.</div>
      </div>

      <div style={S('margin-top:22px')}>
        <TextArea
          label="Your volunteering experience"
          value={d.founderExperience}
          onChange={(v) => set({ founderExperience: v })}
          maxLength={280}
          minHeight={64}
          bg="#FCFAF8"
          fs={14}
          error={errors.founderExperience}
          placeholder="A sentence or two — where you have volunteered and roughly how much."
        />
        <div className="vu-hint" style={S('margin-top:7px;font:450 12px/1.5 Geist;color:#8A8179')}>
          {hasHours
            ? 'We can see your verified hours in-app, so this is optional — but a line here helps sponsors trust a new project.'
            : 'Founders do a little volunteering before leading. Just a sentence or two — nothing formal.'}
        </div>
      </div>

      <div style={S('margin-top:24px;border-top:1px solid #F1EBE4;padding-top:22px')} />
      <div className="vu-2col-keep" style={S('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
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
        <NextBtn label={d.orgType === 'team' ? 'Continue to roles' : 'Continue to positions'} onClick={onNext} />
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
          style={S('display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
        >
          Add position
        </Pressable>
        <Pressable
          label="Copy positions from a template"
          expanded={false}
          onClick={useTemplate}
          className={cx(H.secondary, H.press)}
          style={S('display:inline-flex;align-items:center;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
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
        <Checkbox checked={d.safety.staff} onChange={(v) => set({ safety: { ...d.safety, staff: v } })} label={(d.orgClass || 'student') === 'official' ? 'A staff supervisor from your organization is present at every session' : 'A staff member from the sponsor is present at every session'} />
        <Checkbox checked={d.safety.consent} onChange={(v) => set({ safety: { ...d.safety, consent: v } })} label="Guardian consent collected for anyone under 16" />
        <Checkbox checked={d.safety.pair} onChange={(v) => set({ safety: { ...d.safety, pair: v } })} label="Never fewer than two volunteers on site" />
      </div>
      {errors.safety ? <div className="vu-err">{errors.safety}</div> : null}

      <PipelineEditor
        steps={d.pipeline}
        onChange={(pipeline) => set({ pipeline })}
        title="Before their first shift"
        blurb="Quality control for new volunteers. Everyone you accept clears these steps before they can work a session — a briefing call, a consent form, role training. Reorder or remove any that do not apply."
      />

      <div className="vu-stack vu-stack-gap" style={S('margin-top:24px;display:flex;align-items:center;gap:12px')}>
        <NextBtn label="Continue to review" onClick={onNext} />
        <BackBtn onClick={onBack} />
      </div>
    </Card>
  );
}

/* What each step kind asks the organizer to provide, so the step is actually
   actionable for the volunteer. A meeting needs a link + a time; a form needs a
   link + a due date; training an optional link + a when; a manual check needs
   nothing extra. */
const STEP_FIELDS = {
  meeting: {
    link: { label: 'Meeting link', ph: 'Paste the Zoom / Google Meet link', required: true },
    when: { label: 'When', ph: 'e.g. Tue Aug 20, 4:00pm' },
  },
  form: {
    link: { label: 'Form link', ph: 'Paste the Google Form / sign-up link', required: true },
    due: { label: 'Due date', ph: 'e.g. Aug 25' },
  },
  training: {
    link: { label: 'Training link (optional)', ph: 'Paste a video or doc link', required: false },
    when: { label: 'When', ph: 'e.g. Before your first shift' },
  },
  check: {},
};

/** A pipeline step is incomplete if its kind requires a link and none is set. */
export function stepNeedsLink(s) {
  const cfg = STEP_FIELDS[s.kind];
  return !!(cfg && cfg.link && cfg.link.required && !(s.link || '').trim());
}

/* Shared pipeline editor: a list of QC steps, edited inline. Each step collects
   the details the volunteer needs to actually do it — no reorder arrows. */
function PipelineEditor({ steps, onChange, title, blurb }) {
  const setStep = (i, patch) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i) => onChange(steps.filter((_, j) => j !== i));
  const add = () => onChange([...steps, { id: `pl-user-${steps.length}-${title.length}`, label: '', kind: 'check', required: true, note: '', link: '', when: '', due: '' }]);

  return (
    <div style={S('margin-top:24px')}>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>{title}</div>
      <div style={S('margin-top:8px;font:450 13px/1.5 Geist;color:#6B635C;max-width:620px')}>{blurb}</div>
      <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
        {steps.map((s, i) => {
          const cfg = STEP_FIELDS[s.kind] || {};
          const linkMissing = stepNeedsLink(s) && (s.label || '').trim();
          return (
            <div key={s.id || i} style={S('padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
              <div style={S('display:flex;align-items:center;gap:10px')}>
                <div style={S(`width:24px;height:24px;border-radius:8px;flex:none;display:grid;place-items:center;background:#F1EBE4;font:600 11px/1 ${MONO};color:#8A8179`)}>{i + 1}</div>
                <div style={S('flex:1;min-width:0')}>
                  <Field label="" value={s.label} onChange={(v) => setStep(i, { label: v })} placeholder="e.g. Attend the Zoom briefing" bg="#fff" fs={14} maxLength={70} />
                </div>
                <Pressable label="Remove step" onClick={() => remove(i)} className={cx(H.secondary, H.press)} style={S('flex:none;padding:0 12px;height:34px;border-radius:9px;border:1px solid #EBD3C8;background:#fff;font:600 12px/1 Geist;color:#A8482A;cursor:pointer')}>Remove</Pressable>
              </div>
              <div className="vu-2col-keep" style={S('margin-top:10px;display:grid;grid-template-columns:180px 1fr;gap:12px;align-items:center')}>
                <Select label="" value={s.kind} options={TASK_KINDS.map((k) => ({ v: k, l: KIND_LABEL[k] }))} onChange={(v) => setStep(i, { kind: v })} bg="#fff" fs={13} />
                <label style={S('display:flex;align-items:center;gap:8px;cursor:pointer;font:450 13px/1 Geist;color:#57504A')}>
                  <input type="checkbox" checked={s.required !== false} onChange={(e) => setStep(i, { required: e.target.checked })} style={S('width:15px;height:15px;accent-color:#C2603C;cursor:pointer')} />
                  Required to work a shift
                </label>
              </div>

              {cfg.link || cfg.when || cfg.due ? (
                <div className="vu-2col-keep" style={S('margin-top:10px;display:grid;grid-template-columns:1fr 180px;gap:12px;align-items:start')}>
                  {cfg.link ? (
                    <Field
                      label=""
                      value={s.link || ''}
                      onChange={(v) => setStep(i, { link: v })}
                      placeholder={cfg.link.ph}
                      bg="#fff"
                      fs={13}
                      maxLength={300}
                      inputMode="url"
                      error={linkMissing ? 'Paste the link so volunteers can do this step.' : undefined}
                    />
                  ) : <span />}
                  {cfg.when ? (
                    <Field label="" value={s.when || ''} onChange={(v) => setStep(i, { when: v })} placeholder={cfg.when.ph} bg="#fff" fs={13} maxLength={40} />
                  ) : cfg.due ? (
                    <Field label="" value={s.due || ''} onChange={(v) => setStep(i, { due: v })} placeholder={cfg.due.ph} bg="#fff" fs={13} maxLength={40} />
                  ) : <span />}
                </div>
              ) : null}

              <div style={S('margin-top:10px')}>
                <Field label="" value={s.note || ''} onChange={(v) => setStep(i, { note: v })} placeholder="A short note the volunteer sees (optional)" bg="#fff" fs={13} maxLength={120} />
              </div>
            </div>
          );
        })}
        {!steps.length ? (
          <div style={S('padding:16px;border-radius:12px;border:1px dashed #E0D8CF;background:#FCFAF8;font:450 13px/1.5 Geist;color:#8A8179;text-align:center')}>
            No steps yet. Accepted volunteers can work right away. Add a step to gate the first shift.
          </div>
        ) : null}
      </div>
      <Pressable
        label="Add a pipeline step"
        onClick={add}
        className={cx(H.secondary, H.press)}
        style={S('margin-top:12px;display:inline-flex;align-items:center;gap:8px;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}
      >
        + Add a step
      </Pressable>
    </div>
  );
}

function Step4({ d, publishing, onPublish, onBack, account, isTeam }) {
  const slots = totalSlots(d);
  const sessions = generatedSessions(d);
  const safe = safetyComplete(d);
  const roles = (d.teamRoles || []).filter((r) => r.name && r.name.trim());
  const starter = (d.starterTasks || []).filter((t) => t.title && t.title.trim());
  const pipe = (d.pipeline || []).filter((s) => s.label && s.label.trim());
  const rows = isTeam
    ? [
        ['Type', 'Project team · task board'],
        ['Roles', `${roles.length} with briefings`],
        ['Starter tasks', `${starter.length} on the board`],
        ['Members', d.audience.length ? d.audience.join(', ') : 'Open to everyone'],
      ]
    : [
        ['Type', 'Volunteer program · shifts'],
        ['Positions', `${d.positions.length} defined, ${slots} slots`],
        ['Sessions', `${sessions.length} ${/one time/i.test(d.repeats) ? 'one off' : 'weekly'}`],
        ['Pipeline', pipe.length ? `${pipe.length} step${pipe.length === 1 ? '' : 's'} before first shift` : 'None — volunteers work right away'],
        ['Applications', d.audience.length ? d.audience.join(', ') : 'Open to everyone'],
      ];
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
          <div style={S(`margin-top:10px;font:500 11px/1 ${MONO};color:#C2603C`)}>{isTeam ? `${roles.length} role${roles.length === 1 ? '' : 's'} · ${starter.length} task${starter.length === 1 ? '' : 's'}` : `0 of ${slots} crew`}</div>
        </div>
        <div style={S('border-radius:12px;border:1px solid #F1EBE4;overflow:hidden')}>
          {rows.map(([l, v]) => (
            <div key={l} style={S('padding:13px 16px;border-bottom:1px solid #F1EBE4;display:flex;justify-content:space-between;gap:12px;font:450 13px/1 Geist;color:#57504A')}>
              <span>{l}</span>
              <span style={S('color:#1A1714;font-weight:500;text-align:right')}>{v}</span>
            </div>
          ))}
          <div style={S('padding:13px 16px;display:flex;justify-content:space-between;gap:12px;font:450 13px/1 Geist;color:#57504A')}>
            <span>{isTeam ? 'Ready to run' : 'Safety plan'}</span>
            <span style={s('font-weight:500', `color:${isTeam || safe ? '#3F6B4E' : '#8A5A20'}`)}>{isTeam ? 'Yes' : safe ? 'Ready for sponsor' : 'Needs attention'}</span>
          </div>
        </div>
      </div>
      <div className="vu-stack vu-stack-gap" style={S('margin-top:22px;display:flex;align-items:center;gap:12px')}>
        <NextBtn label={isTeam ? 'Publish and start assigning' : 'Publish and start recruiting'} onClick={onPublish} busy={publishing} />
        <BackBtn onClick={onBack} />
      </div>
    </Card>
  );
}

const ROLE_COLORS = ['#C2603C', '#3F6B4E', '#5B6BB0', '#8A5A20', '#9B4A6B', '#4A7C8A'];

function Step2Team({ d, set, errors, onNext, onBack }) {
  const roles = d.teamRoles || [];
  const setRole = (i, patch) => set({ teamRoles: roles.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const remove = (i) => {
    const goneId = roles[i] && roles[i].id;
    set({
      teamRoles: roles.filter((_, j) => j !== i),
      starterTasks: (d.starterTasks || []).map((t) => (t.roleId === goneId ? { ...t, roleId: '' } : t)),
    });
  };
  const add = () => set({ teamRoles: [...roles, { id: `tr-user-${roles.length}-${Date.now().toString(36)}`, name: '', briefing: '', color: ROLE_COLORS[roles.length % ROLE_COLORS.length] }] });

  return (
    <Card>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>Step 2 of 4</div>
      <h2 style={S('margin:14px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Roles and briefings</h2>
      <div style={S('margin-top:8px;font:450 14px/1.5 Geist;color:#6B635C;max-width:620px')}>
        Every member joins a role. The briefing is what they read first — what the role owns, how you work, and where to look. Members confirm they read it before their tasks unlock.
      </div>

      <div style={S('margin-top:20px;display:flex;flex-direction:column;gap:14px')}>
        {roles.map((r, i) => (
          <div key={r.id || i} style={S('padding:16px;border-radius:14px;border:1px solid #F1EBE4;background:#FCFAF8')}>
            <div style={S('display:flex;align-items:center;gap:10px')}>
              <div style={s('width:10px;height:10px;border-radius:50%;flex:none', `background:${r.color || '#C2603C'}`)} />
              <div style={S('flex:1;min-width:0')}>
                <Field label="" value={r.name} onChange={(v) => setRole(i, { name: v })} placeholder="Role name — e.g. Outreach lead" bg="#fff" fs={14} maxLength={40} />
              </div>
              <Pressable label="Remove role" onClick={() => remove(i)} className={cx(H.danger, H.press)} style={S('width:30px;height:30px;border-radius:8px;border:1px solid #EBD3C8;background:#fff;font:500 13px/1 Geist;color:#A8482A;cursor:pointer;flex:none')}>✕</Pressable>
            </div>
            <div style={S('margin-top:10px;display:flex;gap:6px;flex-wrap:wrap')}>
              {ROLE_COLORS.map((c) => (
                <Pressable
                  key={c}
                  label="Set role color"
                  onClick={() => setRole(i, { color: c })}
                  style={s('width:22px;height:22px;border-radius:50%;cursor:pointer', `background:${c}`, `border:2px solid ${r.color === c ? '#1A1714' : 'transparent'}`)}
                />
              ))}
            </div>
            <div style={S('margin-top:12px')}>
              <TextArea label="Briefing" value={r.briefing} onChange={(v) => setRole(i, { briefing: v })} maxLength={600} minHeight={80} bg="#fff" fs={13} placeholder="What this role owns, how the team works, and what to do first." />
            </div>
          </div>
        ))}
      </div>
      {errors.teamRoles ? <div className="vu-err">{errors.teamRoles}</div> : null}

      <Pressable label="Add a role" onClick={add} className={cx(H.secondary, H.press)} style={S('margin-top:14px;display:inline-flex;align-items:center;gap:8px;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}>
        + Add a role
      </Pressable>

      <div className="vu-stack vu-stack-gap" style={S('margin-top:24px;display:flex;align-items:center;gap:12px')}>
        <NextBtn label="Continue to tasks" onClick={onNext} />
        <BackBtn onClick={onBack} />
      </div>
    </Card>
  );
}

function Step3Team({ d, set, errors, onNext, onBack }) {
  const tasks = d.starterTasks || [];
  const roles = (d.teamRoles || []).filter((r) => r.name && r.name.trim());
  const roleOpts = [{ v: '', l: 'Unassigned role' }, ...roles.map((r) => ({ v: r.id, l: r.name }))];
  const setTask = (i, patch) => set({ starterTasks: tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const remove = (i) => set({ starterTasks: tasks.filter((_, j) => j !== i) });
  const add = () => set({ starterTasks: [...tasks, { id: `st-user-${tasks.length}-${Date.now().toString(36)}`, title: '', roleId: roles[0] ? roles[0].id : '' }] });

  return (
    <Card>
      <div style={S(`font:500 11px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:#A9A097`)}>Step 3 of 4</div>
      <h2 style={S('margin:14px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Starter tasks</h2>
      <div style={S('margin-top:8px;font:450 14px/1.5 Geist;color:#6B635C;max-width:620px')}>
        Seed the board so no one lands on an empty page. Tag each task to a role now; assign it to a person once your team fills in. You can add, move and reassign everything later.
      </div>

      <div style={S('margin-top:20px;display:flex;flex-direction:column;gap:10px')}>
        {tasks.map((t, i) => (
          <div key={t.id || i} className="vu-2col-keep" style={S('padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8;display:grid;grid-template-columns:1fr 200px 34px;gap:12px;align-items:center')}>
            <Field label="" value={t.title} onChange={(v) => setTask(i, { title: v })} placeholder="Task — e.g. Draft the outreach email" bg="#fff" fs={14} maxLength={80} />
            <Select label="" value={t.roleId || ''} options={roleOpts} onChange={(v) => setTask(i, { roleId: v })} bg="#fff" fs={13} />
            <Pressable label="Remove task" onClick={() => remove(i)} className={cx(H.danger, H.press)} style={S('width:30px;height:30px;border-radius:8px;border:1px solid #EBD3C8;background:#fff;font:500 13px/1 Geist;color:#A8482A;cursor:pointer')}>✕</Pressable>
          </div>
        ))}
        {!tasks.length ? (
          <div style={S('padding:16px;border-radius:12px;border:1px dashed #E0D8CF;background:#FCFAF8;font:450 13px/1.5 Geist;color:#8A8179;text-align:center')}>
            No starter tasks. That is fine — you can build the board once you publish.
          </div>
        ) : null}
      </div>

      <Pressable label="Add a task" onClick={add} className={cx(H.secondary, H.press)} style={S('margin-top:14px;display:inline-flex;align-items:center;gap:8px;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer')}>
        + Add a task
      </Pressable>

      <div className="vu-stack vu-stack-gap" style={S('margin-top:24px;display:flex;align-items:center;gap:12px')}>
        <NextBtn label="Continue to review" onClick={onNext} />
        <BackBtn onClick={onBack} />
      </div>
    </Card>
  );
}
