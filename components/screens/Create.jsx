'use client';

/* ==========================================================================
   Create.jsx, design screen: `isCreate` (new student project wizard)
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { S, s, cx, H } from '../../lib/style.js';
import { ImageSlot, Pressable, Field, Select, TextArea, Checkbox, Chip, EmptyState, Icon } from '../ui.jsx';
import { useSnapshot, update } from '../../lib/store.js';
import { openModal, confirmDialog, toast, menuFromEvent } from '../../lib/overlays.js';
import { createProject, perform, verifiedHours, canCreateProject, projectBlockingCreation, getProject, parseSessionDate } from '../../lib/db.js';
import { projectTemplates, PEXELS } from '../../lib/seed.js';
import {
  defaultDraft, generatedSessions, totalSlots, safetyComplete, validateFirstSession,
  CAUSE_OPTIONS, TERM_OPTIONS, REPEAT_OPTIONS, AUDIENCE_OPTIONS, MISSION_MAX,
  ORG_TYPES, TASK_KINDS,
} from '../../lib/createDraft.js';

const MONO = "'Geist Mono',monospace";
const BRAND = '#C2603C';
const DEFAULT_CAP = 9;

const STEP_SETS = {
  volunteering: [
    { label: 'Basics', desc: 'Type, mission, cause' },
    { label: 'Positions', desc: 'Roles and requirements' },
    { label: 'Schedule', desc: 'Shifts and safety' },
    { label: 'Review', desc: 'Check and publish' },
  ],
  team: [
    { label: 'Basics', desc: 'Type, mission, cause' },
    { label: 'Roles', desc: 'Roles and briefings' },
    { label: 'Tasks', desc: 'Starter task board' },
    { label: 'Review', desc: 'Check and publish' },
  ],
};

const KIND_LABEL = { meeting: 'Meeting', form: 'Form', training: 'Training', check: 'Check' };

const DELIVERY_OPTS = [
  { v: 'in_person', icons: ['pin'], l: 'In person', d: 'At a physical site' },
  { v: 'remote', icons: ['laptop'], l: 'Remote', d: 'Online, from anywhere' },
  { v: 'hybrid', icons: ['pin', 'laptop'], l: 'Both', d: 'Some in person, some remote' },
];

const COVERS = [PEXELS.reading2, PEXELS.food, PEXELS.trail, PEXELS.seniors, PEXELS.shelter, PEXELS.lead];

/* Repeats that name a weekday: the first shift has to fall on that day, or
   every generated shift lands on the wrong one. */
const REPEAT_DAY = { 'Every Saturday': 6, 'Every other Saturday': 6, 'Every Sunday': 0 };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* Wizard-only responsive tweaks. globals.css is shared, so these stay scoped
   to cr-* class names used only on this screen. */
const LOCAL_CSS = `
@media (max-width: 900px) {
  .cr-rail { flex-direction:row !important; gap:6px !important; overflow-x:auto; }
  .cr-rail .cr-step { flex:1 1 0; min-width:0; padding:10px 8px !important; flex-direction:column; align-items:center !important; gap:6px !important; text-align:center; }
  .cr-rail .cr-desc { display:none; }
  .cr-draft { margin-top:8px !important; padding:12px 14px !important; display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .cr-draft .cr-draft-body { display:none; }
  .cr-draft .cr-discard { margin-top:0 !important; }
}
@media (max-width: 720px) {
  .cr-deliv { grid-template-columns:1fr !important; }
  .cr-card { padding:20px 16px !important; }
  .cr-task { grid-template-columns:1fr 34px !important; }
  .cr-task > .cr-task-role { grid-column:1 / -1; grid-row:2; }
  .cr-pos-head { display:none !important; }
  .cr-pos-row { grid-template-columns:1fr 40px !important; row-gap:6px !important; }
  .cr-pos-row > .cr-pos-meta { grid-column:1; }
  .cr-pos-row > .cr-pos-more { grid-column:2; grid-row:1 / span 2; }
}
`;

/** "10:00 to 12:00" → minutes since midnight for both ends, or null. */
function parseTimeRange(v) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(?:to|-|–)\s*(\d{1,2}):(\d{2})\s*$/.exec(String(v || ''));
  if (!m) return null;
  const [h1, m1, h2, m2] = m.slice(1).map(Number);
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null;
  return { start: h1 * 60 + m1, end: h2 * 60 + m2 };
}

function timeError(v) {
  const r = parseTimeRange(v);
  if (!r) return 'Enter a time range like 10:00 to 12:00.';
  if (r.end <= r.start) return 'The end time has to be after the start time.';
  return null;
}

/** Past dates (including today once the shift's start time has passed) and
    weekday mismatches, in the wizard's words. */
function firstShiftError(d) {
  const base = validateFirstSession(d.firstSession, { time: d.time });
  if (base) return base;
  const want = REPEAT_DAY[d.repeats];
  if (want === undefined) return null;
  const date = parseSessionDate(normalizeLabel(d.firstSession));
  if (date.getDay() !== want) {
    return `${normalizeLabel(d.firstSession)} is a ${DAY_NAMES[date.getDay()]}. Choose a ${DAY_NAMES[want]} or change Repeats.`;
  }
  return null;
}

function normalizeLabel(v) {
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(String(v || ''));
  if (!m) return String(v || '').trim();
  return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${Number(m[2])}`;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function Create() {
  const router = useRouter();
  const { state } = useSnapshot();
  const [draft, setDraft] = useState(() => state.drafts.create || defaultDraft());
  const [errors, setErrors] = useState({});
  const [publishing, setPublishing] = useState(false);
  // Set once publish succeeds, so the new project (which has no attendance
  // yet) doesn't flash the "finish your current project" gate before redirect.
  const published = useRef(false);

  // Autosave on every edit. Drafts sync with the rest of the user's state.
  useEffect(() => {
    if (published.current) return;
    update(
      (st) => {
        st.drafts.create = draft;
      },
      { silent: true }
    );
  }, [draft]);

  const step = Math.min(4, Math.max(1, draft.step || 1));
  const isTeam = draft.orgType === 'team';
  const isOfficial = (draft.orgClass || 'student') === 'official';
  const STEPS = STEP_SETS[isTeam ? 'team' : 'volunteering'];
  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    // Editing a field clears its old error; the next Continue re-checks it.
    setErrors((e) => {
      // The first-shift check reads the time too (today is refused once the
      // start has passed), so a time edit re-opens that error as well.
      const touched = 'time' in patch ? [...Object.keys(patch), 'firstSession'] : Object.keys(patch);
      const keys = touched.filter((k) => e[k]);
      if (!keys.length) return e;
      const next = { ...e };
      keys.forEach((k) => delete next[k]);
      return next;
    });
  };
  const hasHours = verifiedHours() > 0;

  // Gate: a new project can start once every live project you run has posted
  // attendance for at least 1 shift (lib/db.js canCreateProject).
  const blocked = !published.current && !canCreateProject();
  if (blocked) return <BlockedScreen project={projectBlockingCreation()} router={router} />;

  function validate(n) {
    const e = {};
    if (n === 1) {
      if (!draft.name.trim()) e.name = 'Enter a project name.';
      if (draft.delivery !== 'remote' && !draft.site.trim()) e.site = 'Enter where it happens.';
      if (!draft.mission.trim()) e.mission = 'Enter a sentence on what happens and who it helps.';
      else if (draft.mission.length > MISSION_MAX) e.mission = `Shorten it to ${MISSION_MAX} characters.`;
      if (draft.website.trim() && !/^https?:\/\/[^\s]+\.[^\s]+/.test(draft.website.trim())) e.website = 'Enter a full link starting with https://';
      // Light check: a lead should have done some volunteering first. Waived
      // when they already have confirmed hours on VolunteerU.
      if (!hasHours && draft.founderExperience.trim().length < 12) {
        e.founderExperience = "Enter a sentence about volunteering you've done.";
      }
    }
    if (n === 2) {
      if (isTeam) {
        if (!draft.teamRoles.some((r) => r.name && r.name.trim())) e.teamRoles = 'Add at least 1 role with a name.';
      } else if (!draft.positions.length) {
        e.positions = 'Add at least 1 position.';
      }
    }
    if (n === 3 && !isTeam) {
      const fe = firstShiftError(draft);
      if (fe) e.firstSession = fe;
      const te = timeError(draft.time);
      if (te) e.time = te;
      if (!safetyComplete(draft)) e.safety = 'Check all 3 boxes before you publish.';
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
    if (n === step) return;
    if (n > step) {
      // Every step before the target has to pass, not only the current one.
      for (let k = step; k < n; k += 1) {
        if (!validate(k)) {
          if (k !== step) set({ step: k });
          toast({ title: `Finish step ${k} first`, tone: 'warn' });
          return;
        }
      }
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
        toast({ title: `Fix step ${n} first`, tone: 'warn' });
        window.scrollTo(0, 0);
        return;
      }
    }
    setPublishing(true);
    try {
      const cap = totalSlots(draft) || DEFAULT_CAP;
      const payload = isTeam
        ? { ...draft, positions: [], sessions: [] }
        : { ...draft, crewTarget: cap, sessions: generatedSessions(draft) };
      published.current = true;
      const project = await perform('create.publish', () => createProject(payload));
      const live = getProject(project.id);
      const onDiscover = !!(live && live.listingId);
      toast({
        title: 'Project published',
        message: onDiscover
          ? `${project.name} is on Discover now. Share the join link too.`
          : `${project.name} is saved. It isn't on Discover yet.`,
        tone: onDiscover ? 'ok' : 'warn',
      });
      router.replace(`/lead/${project.id}/overview`);
    } catch (err) {
      published.current = false;
      if (err && err.code === 'OFFLINE') toast({ title: "You're offline", message: 'Your draft is saved. Publish when you reconnect.', tone: 'danger' });
      else if (!err || err.code !== 'DUPLICATE') toast({ title: "Couldn't publish", message: 'Your draft is saved. Try again in a moment.', tone: 'danger' });
    } finally {
      setPublishing(false);
    }
  }

  async function discard() {
    const ok = await confirmDialog({
      title: 'Discard this draft?',
      body: "Everything you entered will be cleared. You can't undo this.",
      confirmLabel: 'Discard draft',
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    update((st) => {
      st.drafts.create = null;
    });
    setErrors({});
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
      color: step === n ? '#FFFFFF' : '#8A8179',
      border: step === n ? '#1F1B18' : '#E8E1D9',
      titleColor: step >= n ? '#1A1714' : '#8A8179',
    };
  });

  return (
    <div className="vu-screen vu-pad-40" style={S('padding:28px 40px 96px;max-width:1100px')}>
      <style>{LOCAL_CSS}</style>
      <Pressable
        label="Back to project"
        onClick={() => router.push('/lead')}
        className={H.toInk}
        style={S('display:inline-flex;align-items:center;gap:6px;font:500 13px/1 Geist;color:#8A8179;cursor:pointer;width:max-content')}
      >
        <Icon name="arrow-left" size={14} />
        Back to project
      </Pressable>
      <h1 style={S('margin:16px 0 0;font:600 30px/1.06 Geist;letter-spacing:-0.04em')}>{isOfficial ? 'New opportunity' : 'New student project'}</h1>
      <div style={S('margin-top:8px;font:450 15px/1.5 Geist;color:#6B635C')}>
        4 steps. Your draft saves as you go.
      </div>

      <div className="vu-split" style={S('margin-top:26px;display:grid;grid-template-columns:250px 1fr;gap:28px;align-items:start')}>
        <div>
          <nav aria-label="Steps" className="cr-rail" style={S('display:flex;flex-direction:column;gap:4px')}>
            {steps.map((st) => (
              <Pressable
                key={st.n}
                label={`Step ${st.n}, ${st.label}`}
                current={st.n === step ? 'step' : undefined}
                onClick={() => goStep(st.n)}
                className={cx('cr-step', H.nav, H.press)}
                style={S('display:flex;align-items:flex-start;gap:11px;padding:12px;border-radius:11px;cursor:pointer;transition:background .16s ease')}
              >
                <div style={s('width:24px;height:24px;border-radius:8px;display:grid;place-items:center;flex:none', `border:1px solid ${st.border}`, `background:${st.bg}`, `color:${st.color}`, `font:600 11px/1 ${MONO}`)}>
                  {st.n}
                </div>
                <div style={S('min-width:0')}>
                  <div style={s('font:500 13px/1.2 Geist', `color:${st.titleColor}`)}>{st.label}</div>
                  <div className="cr-desc" style={S('margin-top:4px;font:450 11px/1.3 Geist;color:#8A8179')}>{st.desc}</div>
                </div>
              </Pressable>
            ))}
          </nav>
          <div className="cr-draft" style={S('margin-top:14px;padding:16px;border-radius:12px;border:1px solid #E8E1D9;background:#fff')}>
            <div style={S('display:inline-flex;align-items:center;gap:6px;font:500 13px/1 Geist;color:#3F6B4E')}>
              <Icon name="check" size={13} />
              Draft saved
            </div>
            <div className="cr-draft-body" style={S('margin-top:9px;font:450 12px/1.5 Geist;color:#6B635C')}>Saves as you type. Only you can see it until you publish.</div>
            <Pressable label="Discard draft" onClick={discard} className={cx('cr-discard', H.link)} style={S('margin-top:12px;font:500 12px/1 Geist;color:#A8482A;cursor:pointer;width:max-content')}>
              Discard draft
            </Pressable>
          </div>
        </div>

        <div>
          {step === 1 ? <Step1 d={draft} set={set} errors={errors} onNext={next} router={router} hasHours={hasHours} /> : null}
          {step === 2 && !isTeam ? <Step2 d={draft} set={set} errors={errors} onNext={next} onBack={() => goStep(1)} /> : null}
          {step === 2 && isTeam ? <Step2Team d={draft} set={set} errors={errors} onNext={next} onBack={() => goStep(1)} /> : null}
          {step === 3 && !isTeam ? <Step3 d={draft} set={set} errors={errors} onNext={next} onBack={() => goStep(2)} /> : null}
          {step === 3 && isTeam ? <Step3Team d={draft} set={set} onNext={next} onBack={() => goStep(2)} /> : null}
          {step === 4 ? <Step4 d={draft} publishing={publishing} onPublish={publish} onBack={() => goStep(3)} account={state.account} isTeam={isTeam} /> : null}
        </div>
      </div>
    </div>
  );
}

/* Shown instead of the wizard while another project is still waiting on its
   first posted attendance. Says which one and links straight to it. */
function BlockedScreen({ project, router }) {
  const name = project ? project.name : 'your current project';
  const team = project && project.orgType === 'team';
  const target = project ? `/lead/${project.id}/${team ? 'overview' : 'attendance'}` : '/lead';
  return (
    <div className="vu-screen vu-pad-40" style={S('padding:28px 40px 96px;max-width:1100px')}>
      <Pressable
        label="Back to project"
        onClick={() => router.push('/lead')}
        className={H.toInk}
        style={S('display:inline-flex;align-items:center;gap:6px;font:500 13px/1 Geist;color:#8A8179;cursor:pointer;width:max-content')}
      >
        <Icon name="arrow-left" size={14} />
        Back to project
      </Pressable>
      <h1 style={S('margin:16px 0 0;font:600 30px/1.06 Geist;letter-spacing:-0.04em')}>New student project</h1>
      <div style={S('margin-top:26px;max-width:640px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>
        <EmptyState
          icon="calendar"
          title={`Post attendance for ${name} first`}
          body="Each project you run needs attendance posted for 1 shift before you start another one."
          cta={`Open ${name}`}
          onCta={() => router.push(target)}
        />
      </div>
    </div>
  );
}

function Card({ children }) {
  return <div className="vu-screen cr-card" style={S('padding:26px;border-radius:16px;border:1px solid #E8E1D9;background:#fff')}>{children}</div>;
}

function StepTag({ n }) {
  return <div style={S('font:500 12px/1 Geist;color:#8A8179')}>Step {n} of 4</div>;
}

function Label({ id, children, top = 22 }) {
  return (
    <div id={id} style={s(`margin-top:${top}px`, 'font:600 14px/1.2 Geist;letter-spacing:-0.01em;color:#1A1714')}>
      {children}
    </div>
  );
}

function NextBtn({ label, onClick, busy, busyLabel = 'Publishing' }) {
  return (
    <Pressable
      label={busy ? busyLabel : label}
      disabled={busy}
      onClick={onClick}
      className={cx(H.primary, H.press)}
      style={s(
        'display:inline-flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap;flex:none;padding:0 18px;height:44px;border-radius:12px;border:1px solid #A8482A;color:#fff;font:600 15px/1 Geist;cursor:pointer;transition:background .16s ease, transform .16s ease',
        `background:${BRAND}`
      )}
    >
      {busy ? <span className="vu-spin" /> : null}
      {busy ? busyLabel : label}
    </Pressable>
  );
}

function BackBtn({ onClick }) {
  return (
    <Pressable label="Back" onClick={onClick} className={H.toInk} style={S('font:500 14px/1 Geist;color:#8A8179;cursor:pointer;padding:10px 4px;text-align:center')}>
      Back
    </Pressable>
  );
}

function AddBtn({ label, onClick, top = 14 }) {
  return (
    <Pressable
      label={label}
      onClick={onClick}
      className={cx(H.secondary, H.press)}
      style={s(
        `margin-top:${top}px`,
        'display:inline-flex;align-items:center;gap:7px;white-space:nowrap;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease'
      )}
    >
      <Icon name="plus" size={14} />
      {label}
    </Pressable>
  );
}

function RemoveIconBtn({ label, onClick }) {
  return (
    <Pressable
      label={label}
      onClick={onClick}
      className={cx(H.danger, H.press)}
      style={S('width:34px;height:34px;border-radius:9px;border:1px solid #EBD3C8;background:#fff;color:#A8482A;cursor:pointer;flex:none;display:grid;place-items:center')}
    >
      <Icon name="x" size={14} />
    </Pressable>
  );
}

function Step1({ d, set, errors, onNext, router, hasHours }) {
  function pickCover() {
    openModal({
      title: 'Cover photo',
      subtitle: 'Shown at the top of your project page.',
      size: 'wide',
      Body: function CoverBody({ api }) {
        return (
          <div className="vu-3col" style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:12px')}>
            {COVERS.map((src, i) => (
              <Pressable
                key={src}
                label={`Use cover photo ${i + 1}`}
                pressed={d.cover === src}
                onClick={() => {
                  set({ cover: src });
                  api.close();
                  toast({ title: 'Cover updated', tone: 'ok', timeout: 2000 });
                }}
                className={cx(H.card, H.press)}
                style={s('height:110px;border-radius:12px;overflow:hidden;cursor:pointer', `border:2px solid ${d.cover === src ? BRAND : 'transparent'}`)}
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
      <StepTag n={1} />
      <h2 style={S('margin:10px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>The basics</h2>

      <Label id="cr-kind">What kind of project is this?</Label>
      <div role="radiogroup" aria-labelledby="cr-kind" className="vu-2col-keep" style={S('margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px')}>
        {ORG_TYPES.map((o) => {
          const on = d.orgType === o.id;
          return (
            <Pressable
              key={o.id}
              role="radio"
              aria-checked={on}
              label={`${o.label}, ${o.tagline}`}
              onClick={() => set({ orgType: o.id })}
              className={cx(H.card, H.press)}
              style={s(
                'text-align:left;padding:16px;border-radius:14px;cursor:pointer;transition:border-color .16s ease, background .16s ease',
                `border:1.5px solid ${on ? BRAND : '#E8E1D9'}`,
                `background:${on ? '#FAF6F3' : '#fff'}`
              )}
            >
              <div style={S('display:flex;align-items:center;gap:10px')}>
                <div style={s('width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:none', `background:${on ? BRAND : '#F1EBE4'}`, `color:${on ? '#fff' : '#8A8179'}`)}>
                  <Icon name={o.iconName || 'flag'} size={17} />
                </div>
                <div style={S('min-width:0')}>
                  <div style={S('font:600 15px/1.2 Geist;letter-spacing:-0.02em;color:#1A1714')}>{o.label}</div>
                  <div style={S('margin-top:3px;font:500 12px/1.3 Geist;color:#A8482A')}>{o.tagline}</div>
                </div>
                <div style={s('margin-left:auto;width:20px;height:20px;border-radius:50%;flex:none;display:grid;place-items:center', `border:1.5px solid ${on ? BRAND : '#D8D0C7'}`, `background:${on ? BRAND : '#fff'}`, 'color:#fff')}>
                  {on ? <Icon name="check" size={12} stroke={2.5} /> : null}
                </div>
              </div>
              <div style={S('margin-top:11px;font:450 12.5px/1.5 Geist;color:#57504A')}>{o.blurb}</div>
              <div style={S('margin-top:8px;font:450 12px/1.4 Geist;color:#8A8179')}>e.g. {o.examples}</div>
            </Pressable>
          );
        })}
      </div>

      <Label id="cr-who" top={20}>Who runs it</Label>
      <div role="radiogroup" aria-labelledby="cr-who" style={S('margin-top:10px;display:flex;gap:8px;flex-wrap:wrap')}>
        {[
          { k: 'student', t: 'Student project', d: 'You and other students run it' },
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
                `border:1.5px solid ${on ? BRAND : '#E8E1D9'}`,
                `background:${on ? '#FAF6F3' : '#fff'}`
              )}
            >
              <div style={S('font:600 14px/1.2 Geist;color:#1A1714')}>{o.t}</div>
              <div style={S('margin-top:4px;font:450 12px/1.4 Geist;color:#8A8179')}>{o.d}</div>
            </Pressable>
          );
        })}
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
          placeholder="e.g. 20 hours at the food bank"
        />
        {!errors.founderExperience ? (
          <div className="vu-hint" style={S('margin-top:7px;font:450 12px/1.5 Geist;color:#8A8179')}>
            {hasHours ? "Optional, since you have confirmed hours on VolunteerU." : 'Where you volunteered and roughly how much.'}
          </div>
        ) : null}
      </div>

      <div style={S('margin-top:24px;border-top:1px solid #F1EBE4')} />

      <Label id="cr-delivery">How volunteers take part</Label>
      <div role="radiogroup" aria-labelledby="cr-delivery" className="cr-deliv" style={S('margin-top:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px')}>
        {DELIVERY_OPTS.map((o) => {
          const on = d.delivery === o.v;
          return (
            <Pressable
              key={o.v}
              role="radio"
              aria-checked={on}
              label={`${o.l}, ${o.d}`}
              onClick={() => set({ delivery: o.v })}
              className={cx(H.card, H.press)}
              style={s(
                'padding:13px 14px;border-radius:12px;cursor:pointer;transition:border-color .16s ease, background .16s ease',
                `border:1px solid ${on ? BRAND : '#E8E1D9'}`,
                `background:${on ? '#FCF2EC' : '#FCFAF8'}`
              )}
            >
              <div style={s('display:flex;align-items:center;gap:8px', on ? 'color:#A8482A' : 'color:#57504A')}>
                <span style={S('display:inline-flex;gap:3px')}>
                  {o.icons.map((n) => <Icon key={n} name={n} size={15} />)}
                </span>
                <span style={s('font:600 14px/1 Geist', on ? 'color:#A8482A' : 'color:#1A1714')}>{o.l}</span>
              </div>
              <div style={S('margin-top:6px;font:450 12px/1.4 Geist;color:#8A8179')}>{o.d}</div>
            </Pressable>
          );
        })}
      </div>

      <div className="vu-2col-keep" style={S('margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
        <Field label="Project name" value={d.name} onChange={(v) => set({ name: v })} placeholder="e.g. Northside Reading Circle" bg="#FCFAF8" fs={14} maxLength={60} required error={errors.name} />
        <Select label="Cause area" value={d.cause} onChange={(v) => set({ cause: v })} options={CAUSE_OPTIONS} bg="#FCFAF8" fs={14} />
        <Field
          label={d.delivery === 'remote' ? 'Where it is based (optional)' : 'Site or location'}
          value={d.site}
          onChange={(v) => set({ site: v })}
          bg="#FCFAF8"
          fs={14}
          maxLength={90}
          required={d.delivery !== 'remote'}
          placeholder={d.delivery === 'remote' ? 'e.g. Rivertown' : 'e.g. Rivertown Public Library'}
          error={errors.site}
        />
        <Field label="Website or social link" value={d.website} onChange={(v) => set({ website: v })} placeholder="Optional" bg="#FCFAF8" fs={14} type="url" error={errors.website} />
      </div>
      <div style={S('margin-top:20px')}>
        <TextArea label="Mission" value={d.mission} onChange={(v) => set({ mission: v })} maxLength={MISSION_MAX} counter minHeight={84} bg="#FCFAF8" fs={14} error={errors.mission} placeholder="e.g. Weekly reading help for 2nd graders" />
      </div>
      <div style={S('margin-top:20px')}>
        <TextArea label="Short bio for the project page" value={d.bio} onChange={(v) => set({ bio: v })} maxLength={400} minHeight={70} bg="#FCFAF8" fs={14} placeholder="e.g. We meet in the library's back room." />
      </div>

      <Label top={20}>Track record</Label>
      <div style={S('margin-top:6px;font:450 12px/1.5 Geist;color:#8A8179')}>Run this before? Add rough numbers. Leave them blank if you're starting out.</div>
      <div className="vu-2col-keep" style={S('margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
        <Field label="Events hosted so far" value={d.eventsHosted} onChange={(v) => set({ eventsHosted: v.replace(/\D/g, '').slice(0, 5) })} placeholder="0" bg="#FCFAF8" fs={14} inputMode="numeric" />
        <Field label="Volunteers so far, roughly" value={d.approxVolunteers} onChange={(v) => set({ approxVolunteers: v.replace(/\D/g, '').slice(0, 6) })} placeholder="0" bg="#FCFAF8" fs={14} inputMode="numeric" />
      </div>

      <div className="vu-3col" style={S('margin-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px')}>
        <div>
          <div style={S('font:500 12px/1 Geist;color:#57504A')}>Cover photo</div>
          <Pressable label="Change the cover photo" onClick={pickCover} className={cx(H.link, H.press)} style={S('margin-top:8px;display:block;height:96px;border-radius:11px;overflow:hidden;cursor:pointer;position:relative')}>
            <ImageSlot src={d.cover} shape="rounded" radius={11} placeholder="cover" />
            <span style={S('position:absolute;right:8px;bottom:8px;display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:8px;background:rgba(26,23,20,.72);color:#fff;font:500 11px/1 Geist')}>
              <Icon name="image" size={12} />
              Change
            </span>
          </Pressable>
        </div>
        <Select label="Term length" value={d.term} onChange={(v) => set({ term: v })} options={TERM_OPTIONS} bg="#FCFAF8" fs={14} />
        <div>
          <div style={S('font:500 12px/1 Geist;color:#57504A')}>Who can see it</div>
          <div style={S('margin-top:8px;font:450 14px/1.45 Geist;color:#1A1714')}>Anyone on VolunteerU can find it in Discover.</div>
        </div>
      </div>
      <div className="vu-stack vu-stack-gap" style={S('margin-top:24px;display:flex;align-items:center;gap:12px')}>
        <NextBtn label={d.orgType === 'team' ? 'Continue to roles' : 'Continue to positions'} onClick={onNext} />
        <Pressable
          label="Save and exit"
          onClick={() => {
            toast({ title: 'Draft saved', message: 'Start a project from Lead to pick it up again.', tone: 'ok' });
            router.push('/lead');
          }}
          className={H.toInk}
          style={S('font:500 14px/1 Geist;color:#8A8179;cursor:pointer;padding:10px 4px;text-align:center')}
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

  function applyTemplate(t) {
    set({
      positions: t.positions.map((name) => ({ t: name, slots: name === 'Tutor' || name === 'Crew member' ? 8 : 1, age: '13+', train: 'None', commit: '1 hr weekly', note: '', requirements: [] })),
      cause: t.cause,
    });
    toast({ title: 'Template applied', message: `Added ${plural(t.positions.length, 'position')}. Change spots and ages to fit.`, tone: 'ok' });
  }

  function useTemplate(e) {
    menuFromEvent(
      e,
      projectTemplates.map((t) => ({ key: t.id, label: `${t.t}, ${t.m}`, icon: 'clipboard' })),
      async (key) => {
        const t = projectTemplates.find((x) => x.id === key);
        if (!t) return;
        if (d.positions.length) {
          const ok = await confirmDialog({
            title: `Replace your ${plural(d.positions.length, 'position')}?`,
            body: `The ${t.t} template swaps in its own positions and cause.`,
            confirmLabel: 'Replace positions',
            cancelLabel: 'Keep mine',
            tone: 'brand',
          });
          if (!ok) return;
        }
        applyTemplate(t);
      }
    );
  }

  const cols = 'grid-template-columns:1.4fr .7fr .7fr 1.2fr 40px';
  return (
    <Card>
      <StepTag n={2} />
      <h2 style={S('margin:10px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Who you need</h2>
      <div style={S('margin-top:8px;font:450 14px/1.5 Geist;color:#6B635C')}>Volunteers pick one of these positions when they apply.</div>

      <div style={S('margin-top:20px;border-radius:12px;border:1px solid #F1EBE4;overflow:hidden')}>
        <div className="cr-pos-head" style={s('display:grid;gap:12px;padding:12px 16px;background:#FCFAF8;border-bottom:1px solid #F1EBE4;font:500 12px/1 Geist;color:#8A8179', cols)}>
          <div>Position</div><div>Spots</div><div>Min age</div><div>Training</div><div />
        </div>
        {d.positions.length ? (
          d.positions.map((p, i) => (
            <div key={`${p.t}-${i}`} className={cx('cr-pos-row', H.row)} style={s('display:grid;gap:12px;padding:14px 16px;border-bottom:1px solid #F1EBE4;align-items:center;transition:background .16s ease', cols)}>
              <div style={S('font:500 14px/1.2 Geist;min-width:0;overflow-wrap:anywhere')}>{p.t}</div>
              <div className="cr-pos-meta" style={S('font:450 13px/1.2 Geist;color:#57504A')}>{plural(Number(p.slots) || 0, 'spot')}</div>
              <div className="cr-pos-meta" style={S('font:450 13px/1.2 Geist;color:#57504A')}>Ages {String(p.age).replace(/\D/g, '')}+</div>
              <div className="cr-pos-meta" style={S('font:450 13px/1.2 Geist;color:#57504A')}>{trainLabel(p.train)}</div>
              <Pressable
                label={`Edit ${p.t}`}
                onClick={() => editPosition(i)}
                className={cx('cr-pos-more', H.toInk, H.press)}
                style={S('width:34px;height:34px;border-radius:9px;display:grid;place-items:center;color:#8A8179;cursor:pointer')}
              >
                <Icon name="edit" size={15} />
              </Pressable>
            </div>
          ))
        ) : (
          <div style={S('padding:24px 16px;text-align:center;font:450 13px/1.55 Geist;color:#8A8179')}>
            No positions yet. Add 1 so volunteers can apply.
          </div>
        )}
      </div>
      {errors.positions ? <div className="vu-err">{errors.positions}</div> : null}

      <div style={S('margin-top:16px;display:flex;gap:10px;flex-wrap:wrap')}>
        <AddBtn label="Add position" top={0} onClick={() => editPosition(null)} />
        <Pressable
          label="Copy from a template"
          expanded={false}
          onClick={useTemplate}
          className={cx(H.secondary, H.press)}
          style={S('display:inline-flex;align-items:center;gap:7px;white-space:nowrap;flex:none;padding:0 14px;height:36px;border-radius:10px;border:1px solid #E7C0AC;background:#fff;font:600 13px/1 Geist;color:#C2603C;cursor:pointer;transition:background .16s ease, border-color .16s ease')}
        >
          <Icon name="clipboard" size={14} />
          Copy from a template
        </Pressable>
      </div>

      <Label id="cr-aud" top={24}>Who should apply</Label>
      <div role="group" aria-labelledby="cr-aud" style={S('margin-top:12px;display:flex;flex-wrap:wrap;gap:8px')}>
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

/* Older drafts stored training as "Required · 15 min"; map that to the
   "15 min training" wording the rest of the form uses. */
function trainLabel(v) {
  const raw = String(v || 'None');
  const legacy = raw.match(/^Required\s*·\s*(\d+)\s*min$/i);
  if (legacy) return `${legacy[1]} min training`;
  return raw.replace(/\s*·\s*/g, ', ');
}

const TRAIN_OPTS = ['None', '15 min training', '30 min training', '45 min training', 'Food handling'];
const REQ = ["Parent's OK", 'Media release', 'Food handling', 'Reading training', 'Transport form'];

function DraftPositionForm({ api, pos, onSave, onDelete }) {
  const legacyTrain = pos && pos.train && !TRAIN_OPTS.includes(trainLabel(pos.train)) ? trainLabel(pos.train) : null;
  const [f, setF] = useState({
    t: pos ? pos.t : '',
    slots: pos ? String(pos.slots) : '2',
    age: pos ? pos.age : '13+',
    train: pos ? trainLabel(pos.train) : 'None',
    commit: pos ? pos.commit : '1 hr weekly',
    note: pos ? pos.note : '',
    requirements: pos ? (pos.requirements || []).map((r) => (r === 'Guardian consent' ? "Parent's OK" : r)) : [],
  });
  const [err, setErr] = useState({});
  const trainOptions = legacyTrain ? [...TRAIN_OPTS, legacyTrain] : TRAIN_OPTS;

  function save() {
    const e = {};
    if (!f.t.trim()) e.t = 'Enter a position name.';
    const n = Number(f.slots);
    if (!n || n < 1 || n > 200) e.slots = 'Enter a number from 1 to 200.';
    setErr(e);
    if (Object.keys(e).length) return;
    onSave({ ...f, t: f.t.trim(), slots: n });
    api.close();
    toast({ title: pos ? 'Position updated' : `${f.t.trim()} added`, tone: 'ok', timeout: 2200 });
  }

  return (
    <div>
      <Field label="Position name" value={f.t} onChange={(v) => setF((x) => ({ ...x, t: v }))} onEnter={save} placeholder="e.g. Reading buddy" maxLength={40} required error={err.t} />
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Field label="Spots" value={f.slots} onChange={(v) => setF((x) => ({ ...x, slots: v.replace(/\D/g, '').slice(0, 3) }))} onEnter={save} inputMode="numeric" error={err.slots} />
        <Select label="Minimum age" value={f.age} options={['13+', '14+', '15+', '16+', '18+']} onChange={(v) => setF((x) => ({ ...x, age: v }))} />
      </div>
      <div className="vu-2col-keep" style={S('margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
        <Select label="Training" value={f.train} options={trainOptions} onChange={(v) => setF((x) => ({ ...x, train: v }))} />
        <Select label="Commitment" value={f.commit} options={['1 hr monthly', '1 hr weekly', '2 hrs weekly', '2.5 hrs weekly', '4 hrs weekly']} onChange={(v) => setF((x) => ({ ...x, commit: v }))} />
      </div>
      <div style={S('margin-top:14px')}>
        <Field label="What they do" value={f.note} onChange={(v) => setF((x) => ({ ...x, note: v }))} placeholder="e.g. Read 1-on-1 with a 2nd grader" maxLength={90} />
      </div>
      <div style={S('margin-top:16px')}>
        <div id="cr-req" style={S('font:500 12px/1 Geist;color:#57504A')}>Requirements</div>
        <div role="group" aria-labelledby="cr-req" style={S('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px')}>
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
            label="Remove position"
            onClick={() => {
              onDelete();
              api.close();
              toast({ title: 'Position removed', tone: 'ok', timeout: 2200 });
            }}
            className={cx(H.danger, H.press)}
            style={S('display:inline-flex;align-items:center;padding:0 14px;height:40px;border-radius:11px;border:1px solid #EBD3C8;background:#fff;font:600 13px/1 Geist;color:#A8482A;cursor:pointer')}
          >
            Remove position
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
            onClick={save}
            className={cx(H.primary, H.press)}
            style={s('display:inline-flex;align-items:center;gap:8px;padding:0 18px;height:40px;border-radius:11px;border:1px solid #A8482A;color:#fff;font:600 14px/1 Geist;cursor:pointer', `background:${BRAND}`)}
          >
            {pos ? 'Save position' : 'Add position'}
          </Pressable>
        </div>
      </div>
    </div>
  );
}

function Step3({ d, set, errors, onNext, onBack }) {
  const dateErr = errors.firstSession || firstShiftError(d);
  // Only show the live error once the value reads as a date, so typing "Oc"
  // doesn't flash an error. Submitting shows every error regardless.
  const showDateErr = errors.firstSession || (dateErr && /\b[A-Za-z]{3,}\.?\s+\d{1,2}\b/.test(d.firstSession || '') ? dateErr : null);
  const tErr = errors.time || (parseTimeRange(d.time) ? timeError(d.time) : null);
  const sessions = dateErr ? [] : generatedSessions(d);
  const cap = totalSlots(d) || DEFAULT_CAP;
  const official = (d.orgClass || 'student') === 'official';
  return (
    <Card>
      <StepTag n={3} />
      <h2 style={S('margin:10px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Schedule and safety</h2>
      <div className="vu-3col" style={S('margin-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:start')}>
        <Select label="Repeats" value={d.repeats} onChange={(v) => set({ repeats: v })} options={REPEAT_OPTIONS} bg="#FCFAF8" fs={14} />
        <Field label="Time" value={d.time} onChange={(v) => set({ time: v })} placeholder="10:00 to 12:00" hint="24-hour clock, e.g. 14:00 to 16:00" bg="#FCFAF8" fs={14} error={tErr} />
        <Field label="First shift" value={d.firstSession} onChange={(v) => set({ firstSession: v })} placeholder="e.g. Oct 24" bg="#FCFAF8" fs={14} error={showDateErr} />
      </div>
      <div style={S('margin-top:20px;border-radius:12px;border:1px solid #F1EBE4;overflow:hidden')}>
        <div style={S('padding:12px 16px;background:#FCFAF8;border-bottom:1px solid #F1EBE4;display:flex;justify-content:space-between;gap:12px;font:500 12px/1 Geist;color:#8A8179')}>
          <span>Your shifts</span>
          {sessions.length ? <span>{plural(sessions.length, 'shift')}</span> : null}
        </div>
        {sessions.length ? (
          sessions.map((x, i) => (
            <div key={`${x.d}-${i}`} style={S('padding:13px 16px;border-bottom:1px solid #F1EBE4;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
              <div style={S('font:450 13px/1.3 Geist;color:#332D28')}>
                {x.d}, {x.t}
              </div>
              <div style={S(`font:500 12px/1 ${MONO};color:#8A8179`)}>{plural(cap, 'spot')}</div>
            </div>
          ))
        ) : (
          <div style={S('padding:16px;font:450 13px/1.5 Geist;color:#8A8179')}>Enter an upcoming first shift date to see your shifts.</div>
        )}
      </div>

      <Label id="cr-safety" top={24}>Safety</Label>
      <div style={S('margin-top:6px;font:450 12px/1.5 Geist;color:#8A8179')}>You're agreeing to these for every shift.</div>
      <div role="group" aria-labelledby="cr-safety" style={S('margin-top:12px;display:flex;flex-direction:column;gap:12px')}>
        <Checkbox
          checked={d.safety.staff}
          onChange={(v) => set({ safety: { ...d.safety, staff: v } })}
          label={official ? 'A staff supervisor from your organization is at every shift' : 'An adult from your supervising organization is at every shift'}
        />
        <Checkbox checked={d.safety.consent} onChange={(v) => set({ safety: { ...d.safety, consent: v } })} label="You'll get a parent's OK for anyone under 16" />
        <Checkbox checked={d.safety.pair} onChange={(v) => set({ safety: { ...d.safety, pair: v } })} label="At least 2 volunteers are on site at all times" />
      </div>
      {errors.safety ? <div className="vu-err">{errors.safety}</div> : null}

      <PipelineEditor
        steps={d.pipeline}
        onChange={(pipeline) => set({ pipeline })}
        title="Before their first shift"
        blurb="Steps each accepted volunteer finishes before their first shift. Remove any you don't need."
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
    link: { label: 'Meeting link', ph: 'Zoom or Google Meet link', required: true },
    when: { label: 'When', ph: 'e.g. Tue, Oct 20 at 4 PM' },
  },
  form: {
    link: { label: 'Form link', ph: 'Google Form or sign-up link', required: true },
    due: { label: 'Due date', ph: 'e.g. Oct 25' },
  },
  training: {
    link: { label: 'Training link (optional)', ph: 'Video or doc link', required: false },
    when: { label: 'When', ph: 'e.g. Before your first shift' },
  },
  check: {},
};

/** A pipeline step is incomplete if its kind requires a link and none is set. */
export function stepNeedsLink(s) {
  const cfg = STEP_FIELDS[s.kind];
  return !!(cfg && cfg.link && cfg.link.required && !(s.link || '').trim());
}

/* Shared pipeline editor: a list of steps, edited inline. Each step collects
   the details the volunteer needs to actually do it. */
function PipelineEditor({ steps, onChange, title, blurb }) {
  const setStep = (i, patch) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i) => onChange(steps.filter((_, j) => j !== i));
  const add = () => onChange([...steps, { id: `pl-user-${Date.now().toString(36)}-${steps.length}`, label: '', kind: 'check', required: true, note: '', link: '', when: '', due: '' }]);

  return (
    <div>
      <Label top={24}>{title}</Label>
      <div style={S('margin-top:6px;font:450 13px/1.5 Geist;color:#6B635C;max-width:620px')}>{blurb}</div>
      <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:10px')}>
        {steps.map((s, i) => {
          const cfg = STEP_FIELDS[s.kind] || {};
          const linkMissing = stepNeedsLink(s) && (s.label || '').trim();
          const n = i + 1;
          return (
            <div key={s.id || i} style={S('padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8')}>
              <div style={S('display:flex;align-items:center;gap:10px')}>
                <div aria-hidden="true" style={S(`width:24px;height:24px;border-radius:8px;flex:none;display:grid;place-items:center;background:#F1EBE4;font:600 11px/1 ${MONO};color:#8A8179`)}>{n}</div>
                <div style={S('flex:1;min-width:0')}>
                  <Field label="" ariaLabel={`Step ${n} name`} value={s.label} onChange={(v) => setStep(i, { label: v })} placeholder="e.g. Join the Zoom briefing" bg="#fff" fs={14} maxLength={70} />
                </div>
                <RemoveIconBtn label={`Remove step ${n}`} onClick={() => remove(i)} />
              </div>
              <div className="vu-2col-keep" style={S('margin-top:10px;display:grid;grid-template-columns:180px 1fr;gap:12px;align-items:center')}>
                <Select label="" ariaLabel={`Step ${n} type`} value={s.kind} options={TASK_KINDS.map((k) => ({ v: k, l: KIND_LABEL[k] }))} onChange={(v) => setStep(i, { kind: v })} bg="#fff" fs={13} />
                <label style={S('display:flex;align-items:center;gap:8px;cursor:pointer;font:450 13px/1.2 Geist;color:#57504A')}>
                  <input type="checkbox" checked={s.required !== false} onChange={(e) => setStep(i, { required: e.target.checked })} style={S('width:15px;height:15px;accent-color:#C2603C;cursor:pointer;flex:none')} />
                  Required before their first shift
                </label>
              </div>

              {cfg.link || cfg.when || cfg.due ? (
                <div className="vu-2col-keep" style={S('margin-top:10px;display:grid;grid-template-columns:1fr 180px;gap:12px;align-items:start')}>
                  {cfg.link ? (
                    <Field
                      label=""
                      ariaLabel={`Step ${n} ${cfg.link.label.toLowerCase()}`}
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
                    <Field label="" ariaLabel={`Step ${n} when`} value={s.when || ''} onChange={(v) => setStep(i, { when: v })} placeholder={cfg.when.ph} bg="#fff" fs={13} maxLength={40} />
                  ) : cfg.due ? (
                    <Field label="" ariaLabel={`Step ${n} due date`} value={s.due || ''} onChange={(v) => setStep(i, { due: v })} placeholder={cfg.due.ph} bg="#fff" fs={13} maxLength={40} />
                  ) : <span />}
                </div>
              ) : null}

              <div style={S('margin-top:10px')}>
                <Field label="" ariaLabel={`Step ${n} note`} value={s.note || ''} onChange={(v) => setStep(i, { note: v })} placeholder="Note for the volunteer (optional)" bg="#fff" fs={13} maxLength={120} />
              </div>
            </div>
          );
        })}
        {!steps.length ? (
          <div style={S('padding:16px;border-radius:12px;border:1px dashed #E0D8CF;background:#FCFAF8;font:450 13px/1.5 Geist;color:#8A8179;text-align:center')}>
            No steps. Accepted volunteers can sign up for shifts right away.
          </div>
        ) : null}
      </div>
      <AddBtn label="Add a step" top={12} onClick={add} />
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
  const oneTime = /one time/i.test(d.repeats);
  const rows = isTeam
    ? [
        ['Type', 'Project team with a task board'],
        ['Roles', `${plural(roles.length, 'role')} with briefings`],
        ['Starter tasks', plural(starter.length, 'task')],
        ['Who should apply', d.audience.length ? d.audience.join(', ') : 'Anyone'],
      ]
    : [
        ['Type', 'Volunteer program with shifts'],
        ['Positions', `${plural(d.positions.length, 'position')}, ${plural(slots, 'spot')}`],
        ['Shifts', oneTime ? `1 shift, ${sessions[0] ? sessions[0].d : ''}` : `${plural(sessions.length, 'shift')}, ${d.repeats.replace(/^Every/, 'every')}`],
        ['Before first shift', pipe.length ? plural(pipe.length, 'step') : 'Nothing, they can start right away'],
        ['Who should apply', d.audience.length ? d.audience.join(', ') : 'Anyone'],
        ['Safety', safe ? 'All 3 checked' : 'Needs attention'],
      ];
  const lead = [account.firstName, account.lastName ? `${account.lastName[0]}.` : ''].filter(Boolean).join(' ');
  const leadLine = [lead ? `Led by ${lead}` : '', account.grade ? `Grade ${account.grade}` : ''].filter(Boolean).join(', ');
  return (
    <Card>
      <StepTag n={4} />
      <h2 style={S('margin:10px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Review and publish</h2>
      <div className="vu-split" style={S('margin-top:20px;display:grid;grid-template-columns:260px 1fr;gap:20px;align-items:start')}>
        <div style={S('border-radius:14px;border:1px solid #F1EBE4;background:#FCFAF8;padding:14px')}>
          <div style={S('height:120px;border-radius:10px;overflow:hidden')}>
            <ImageSlot src={d.cover} shape="rounded" radius={10} placeholder="cover" />
          </div>
          <div style={S('margin-top:12px;font:600 15px/1.25 Geist;letter-spacing:-0.02em;overflow-wrap:anywhere')}>{d.name || 'Untitled project'}</div>
          {leadLine ? <div style={S('margin-top:6px;font:450 12px/1.4 Geist;color:#8A8179')}>{leadLine}</div> : null}
          {d.mission ? <div style={S('margin-top:8px;font:450 12.5px/1.45 Geist;color:#57504A;overflow-wrap:anywhere')}>{d.mission}</div> : null}
          <div style={S(`margin-top:10px;font:500 11px/1 ${MONO};color:#A8482A`)}>
            {isTeam ? `${plural(roles.length, 'role')}, ${plural(starter.length, 'task')}` : plural(slots, 'spot')}
          </div>
        </div>
        <div style={S('border-radius:12px;border:1px solid #F1EBE4;overflow:hidden')}>
          {rows.map(([l, v], i) => (
            <div key={l} style={s('padding:13px 16px;display:flex;justify-content:space-between;gap:12px;font:450 13px/1.35 Geist;color:#57504A', i < rows.length - 1 ? 'border-bottom:1px solid #F1EBE4' : '')}>
              <span style={S('flex:none')}>{l}</span>
              <span style={s('font-weight:500;text-align:right;min-width:0;overflow-wrap:anywhere', l === 'Safety' ? `color:${safe ? '#3F6B4E' : '#8A5A20'}` : 'color:#1A1714')}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="vu-stack vu-stack-gap" style={S('margin-top:22px;display:flex;align-items:center;gap:12px')}>
        <NextBtn label="Publish project" onClick={onPublish} busy={publishing} />
        <BackBtn onClick={onBack} />
      </div>
    </Card>
  );
}

const ROLE_COLORS = ['#C2603C', '#3F6B4E', '#5B6BB0', '#8A5A20', '#9B4A6B', '#4A7C8A'];
const ROLE_COLOR_NAMES = ['Terracotta', 'Green', 'Blue', 'Brown', 'Plum', 'Teal'];

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
      <StepTag n={2} />
      <h2 style={S('margin:10px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Roles and briefings</h2>
      <div style={S('margin-top:8px;font:450 14px/1.5 Geist;color:#6B635C;max-width:620px')}>
        Each member joins a role. The briefing is the first thing they read.
      </div>

      <div style={S('margin-top:20px;display:flex;flex-direction:column;gap:14px')}>
        {roles.map((r, i) => (
          <div key={r.id || i} style={S('padding:16px;border-radius:14px;border:1px solid #F1EBE4;background:#FCFAF8')}>
            <div style={S('display:flex;align-items:center;gap:10px')}>
              <div aria-hidden="true" style={s('width:10px;height:10px;border-radius:50%;flex:none', `background:${r.color || BRAND}`)} />
              <div style={S('flex:1;min-width:0')}>
                <Field label="" ariaLabel={`Role ${i + 1} name`} value={r.name} onChange={(v) => setRole(i, { name: v })} placeholder="e.g. Outreach lead" bg="#fff" fs={14} maxLength={40} />
              </div>
              <RemoveIconBtn label={`Remove ${r.name && r.name.trim() ? r.name.trim() : `role ${i + 1}`}`} onClick={() => remove(i)} />
            </div>
            <div role="group" aria-label={`Color for role ${i + 1}`} style={S('margin-top:10px;display:flex;gap:6px;flex-wrap:wrap')}>
              {ROLE_COLORS.map((c, ci) => (
                <Pressable
                  key={c}
                  label={ROLE_COLOR_NAMES[ci]}
                  pressed={r.color === c}
                  onClick={() => setRole(i, { color: c })}
                  style={s('width:24px;height:24px;border-radius:50%;cursor:pointer', `background:${c}`, `border:2px solid ${r.color === c ? '#1A1714' : 'transparent'}`)}
                />
              ))}
            </div>
            <div style={S('margin-top:12px')}>
              <TextArea label="Briefing" value={r.briefing} onChange={(v) => setRole(i, { briefing: v })} maxLength={600} minHeight={80} bg="#fff" fs={13} placeholder="e.g. You run our Instagram and flyers." />
            </div>
          </div>
        ))}
        {!roles.length ? (
          <div style={S('padding:16px;border-radius:12px;border:1px dashed #E0D8CF;background:#FCFAF8;font:450 13px/1.5 Geist;color:#8A8179;text-align:center')}>
            No roles yet. Add 1 so members know where they fit.
          </div>
        ) : null}
      </div>
      {errors.teamRoles ? <div className="vu-err">{errors.teamRoles}</div> : null}

      <AddBtn label="Add a role" onClick={add} />

      <div className="vu-stack vu-stack-gap" style={S('margin-top:24px;display:flex;align-items:center;gap:12px')}>
        <NextBtn label="Continue to tasks" onClick={onNext} />
        <BackBtn onClick={onBack} />
      </div>
    </Card>
  );
}

function Step3Team({ d, set, onNext, onBack }) {
  const tasks = d.starterTasks || [];
  const roles = (d.teamRoles || []).filter((r) => r.name && r.name.trim());
  const roleOpts = [{ v: '', l: 'No role yet' }, ...roles.map((r) => ({ v: r.id, l: r.name }))];
  const setTask = (i, patch) => set({ starterTasks: tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const remove = (i) => set({ starterTasks: tasks.filter((_, j) => j !== i) });
  const add = () => set({ starterTasks: [...tasks, { id: `st-user-${tasks.length}-${Date.now().toString(36)}`, title: '', roleId: roles[0] ? roles[0].id : '' }] });

  return (
    <Card>
      <StepTag n={3} />
      <h2 style={S('margin:10px 0 0;font:600 26px/1.1 Geist;letter-spacing:-0.035em')}>Starter tasks</h2>
      <div style={S('margin-top:8px;font:450 14px/1.5 Geist;color:#6B635C;max-width:620px')}>
        Add a few tasks so the board isn't empty when people join. You can give each one an owner later.
      </div>

      <div style={S('margin-top:20px;display:flex;flex-direction:column;gap:10px')}>
        {tasks.map((t, i) => (
          <div key={t.id || i} className="cr-task" style={S('padding:14px;border-radius:12px;border:1px solid #F1EBE4;background:#FCFAF8;display:grid;grid-template-columns:1fr 200px 34px;gap:12px;align-items:center')}>
            <Field label="" ariaLabel={`Task ${i + 1}`} value={t.title} onChange={(v) => setTask(i, { title: v })} placeholder="e.g. Draft the outreach email" bg="#fff" fs={14} maxLength={80} />
            <div className="cr-task-role">
              <Select label="" ariaLabel={`Role for task ${i + 1}`} value={t.roleId || ''} options={roleOpts} onChange={(v) => setTask(i, { roleId: v })} bg="#fff" fs={13} />
            </div>
            <RemoveIconBtn label={`Remove task ${i + 1}`} onClick={() => remove(i)} />
          </div>
        ))}
        {!tasks.length ? (
          <div style={S('padding:16px;border-radius:12px;border:1px dashed #E0D8CF;background:#FCFAF8;font:450 13px/1.5 Geist;color:#8A8179;text-align:center')}>
            No tasks yet. You can also add them after you publish.
          </div>
        ) : null}
      </div>

      <AddBtn label="Add a task" onClick={add} />

      <div className="vu-stack vu-stack-gap" style={S('margin-top:24px;display:flex;align-items:center;gap:12px')}>
        <NextBtn label="Continue to review" onClick={onNext} />
        <BackBtn onClick={onBack} />
      </div>
    </Card>
  );
}
