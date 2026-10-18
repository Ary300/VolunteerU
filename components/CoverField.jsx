'use client';

/* ==========================================================================
   CoverField, the cover photo control for /create and a project's Settings

   A 4:3 preview cropped the way listing cards crop it, then two ways to set
   it: "Upload a photo" (file picker or drag and drop, downscaled in the
   browser and stored in Supabase Storage, lib/coverUpload.js) and "Choose a
   photo" (the library in lib/coverLibrary.js, the listing's cause first).
   "No photo" clears it, and the listing shows its date tile instead.

   The field never blocks the form: an upload runs in the background with the
   preview already showing, and a failed one leaves the old cover in place
   with a plain sentence under the buttons.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from './ui.jsx';
import { openModal } from '../lib/overlays.js';
import { resolveCover, coverTemplates } from '../lib/photos.js';
import { COVER_ACCEPT, coverFileError, prepareAndUploadCover } from '../lib/coverUpload.js';

const CSS = `
.cf-label { display:block; font:600 13px/1.2 var(--f-body); color:var(--ink); }
.cf-media { position:relative; display:block; width:100%; max-width:300px; aspect-ratio:4 / 3; margin-top:8px; border-radius:var(--r-photo); overflow:hidden; background:var(--mist); }
.cf-media > img { width:100%; height:100%; object-fit:cover; display:block; }
.cf-media.is-drop { outline:2px dashed var(--ink); outline-offset:3px; }
.cf-media.is-busy > img { filter:brightness(.9); }
.cf-state { position:absolute; left:12px; bottom:12px; display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 12px; border-radius:var(--r-pill); background:rgba(255,255,255,.94); box-shadow:0 0 0 1px rgba(30,36,33,.06); font:600 13px/1 var(--f-body); color:var(--ink); }
.cf-state .vu-spin { width:14px; height:14px; }
.cf-acts { margin-top:12px; display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; max-width:300px; }
.cf-acts > .vu-btn { white-space:nowrap; }
.cf-none { grid-column:1 / -1; justify-self:start; margin-top:4px; }
.cf-help { margin:10px 0 0; max-width:300px; font:400 13px/1.45 var(--f-body); color:var(--ink-2); }
.cf-err { margin:10px 0 0; max-width:300px; font:500 13px/1.45 var(--f-body); color:var(--ember-deep); }
.cf-file { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; border:0; padding:0; margin:-1px; }

.cf-grid { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; }
.cf-pick { position:relative; display:block; width:100%; padding:0; border:0; aspect-ratio:4 / 3; border-radius:var(--r-control); overflow:hidden; cursor:pointer; background:var(--mist); }
.cf-pick img { width:100%; height:100%; object-fit:cover; display:block; transition:filter .16s ease; }
@media (hover:hover) { .cf-pick:hover img { filter:brightness(.92); } }
.cf-pick[aria-pressed="true"] { box-shadow:0 0 0 2px #fff, 0 0 0 4px var(--ink); }
.cf-pick:focus-visible { outline:2px solid var(--ink); outline-offset:5px; }
.cf-pick-on { position:absolute; right:8px; top:8px; width:26px; height:26px; border-radius:50%; display:grid; place-items:center; background:var(--ink); color:#fff; }
.cf-group { margin-top:28px; }
.cf-group-h { margin:0 0 12px; font:600 14px/1.3 var(--f-body); color:var(--ink); }
.cf-more { margin-top:20px; }
@media (max-width:720px) {
  .cf-media, .cf-acts, .cf-help, .cf-err { max-width:none; }
  .cf-grid { grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
}
@media (prefers-reduced-motion:reduce) { .cf-pick img { transition:none; } }
`;

/* Wait for the uploaded photo to load before swapping the local preview for
   it, so the field doesn't flash empty. Gives up after a few seconds. */
function preload(url, ms = 6000) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => resolve();
    const t = setTimeout(done, ms);
    img.onload = () => { clearTimeout(t); done(); };
    img.onerror = () => { clearTimeout(t); done(); };
    img.src = url;
  });
}

function Thumb({ photo, on, onPick }) {
  return (
    <button type="button" className="cf-pick" aria-pressed={on ? 'true' : 'false'} aria-label={`Use the photo of ${photo.subject}`} onClick={() => onPick(photo)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.sm} alt="" loading="lazy" decoding="async" style={{ objectPosition: photo.pos }} />
      {on ? (
        <span className="cf-pick-on" aria-hidden="true">
          <Icon name="check" size={15} stroke={2.25} />
        </span>
      ) : null}
    </button>
  );
}

/** The library grid inside the "Choose a photo" dialog. */
function CoverPicker({ cause, currentKey, onPick }) {
  const { own, rest, label } = coverTemplates(cause);
  const [all, setAll] = useState(!own.length);
  return (
    <div>
      {own.length ? (
        <section aria-label={`Photos for ${label}`}>
          <div className="cf-grid">
            {own.map((p) => <Thumb key={p.key} photo={p} on={p.key === currentKey} onPick={onPick} />)}
          </div>
        </section>
      ) : null}
      {all ? (
        rest.map((g) => (
          <section key={g.set} className="cf-group" aria-labelledby={`cf-g-${g.set}`}>
            <h3 id={`cf-g-${g.set}`} className="cf-group-h">{g.label}</h3>
            <div className="cf-grid">
              {g.photos.map((p) => <Thumb key={p.key} photo={p} on={p.key === currentKey} onPick={onPick} />)}
            </div>
          </section>
        ))
      ) : (
        <div className="cf-more">
          <Button variant="ghost" size="sm" onClick={() => setAll(true)} aria-expanded="false">
            Show all photos
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.value the stored cover URL, '' for none
 * @param {string} [props.suggested] a library photo shown while value is '' (Create's default by cause)
 * @param {string} [props.cause] the listing's cause, any wording
 * @param {import('react').ReactNode} props.fallback what the preview shows with no photo (a DateTile)
 * @param {(cover: string, meta: { kind: 'upload' | 'library' | 'none' }) => void} props.onChange
 * @param {string} [props.id]
 * @param {string} [props.label]
 */
export default function CoverField({ value, suggested = '', cause = '', fallback, onChange, id = 'cover', label = 'Cover photo' }) {
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drop, setDrop] = useState(false);
  const fileRef = useRef(null);
  const alive = useRef(true);
  const previewRef = useRef('');

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const own = value ? resolveCover(value) : null;
  const usingSuggestion = !value && Boolean(suggested);
  const shown = own || (usingSuggestion ? resolveCover(suggested) : null);
  const src = preview || (shown ? shown.src : '');

  function setLocalPreview(url) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreview(url);
  }

  async function takeFile(file) {
    if (busy) return;
    setError('');
    const problem = coverFileError(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const url = await prepareAndUploadCover(file, { onPreview: (u) => alive.current && setLocalPreview(u) });
      await preload(url);
      if (!alive.current) return;
      onChange(url, { kind: 'upload' });
    } catch (e) {
      if (!alive.current) return;
      setError(e && e.code ? e.message : "The photo didn't upload. Try again.");
      if (!(e && e.code)) console.error('[cover] upload failed', e);
    } finally {
      if (alive.current) {
        setBusy(false);
        setLocalPreview('');
      }
    }
  }

  function chooseLibrary() {
    const current = resolveCover(value || suggested);
    openModal({
      title: 'Choose a photo',
      size: 'wide',
      Body: function CoverPickerBody({ api }) {
        return (
          <CoverPicker
            cause={cause}
            currentKey={current ? current.key : ''}
            onPick={(p) => {
              setError('');
              onChange(p.src, { kind: 'library' });
              api.close();
            }}
          />
        );
      },
    });
  }

  const helpId = `${id}-help`;
  let help = 'JPEG, PNG or WebP, up to 5 MB.';
  if (busy) help = 'Uploading your photo.';
  else if (usingSuggestion) help = 'Suggested for this cause. Upload your own or choose another.';
  else if (!shown) help = 'No photo, so your listing shows its next date.';

  return (
    <div role="group" aria-labelledby={`${id}-label`}>
      <style>{CSS}</style>
      <span className="cf-label" id={`${id}-label`}>{label}</span>
      <div
        className={`cf-media${drop ? ' is-drop' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(e) => {
          if (busy || !e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!drop) setDrop(true);
        }}
        onDragLeave={() => setDrop(false)}
        onDrop={(e) => {
          if (busy || !e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
          e.preventDefault();
          setDrop(false);
          takeFile(e.dataTransfer.files[0]);
        }}
        data-testid="cover-preview"
      >
        {src ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={src} alt="" decoding="async" style={{ objectPosition: preview ? 'center' : shown.pos || 'center' }} />
        ) : (
          fallback
        )}
        {busy ? (
          <span className="cf-state" aria-hidden="true">
            <span className="vu-spin" />
            Uploading
          </span>
        ) : null}
      </div>
      <input
        ref={fileRef}
        id={`${id}-file`}
        className="cf-file"
        type="file"
        accept={COVER_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = '';
          if (f) takeFile(f);
        }}
      />
      <div className="cf-acts">
        <Button size="sm" icon="upload" full extra="padding:0 10px" busy={busy} onClick={() => fileRef.current && fileRef.current.click()} aria-describedby={helpId}>
          {busy ? 'Uploading photo' : 'Upload a photo'}
        </Button>
        <Button size="sm" icon="image" full extra="padding:0 10px" disabled={busy} onClick={chooseLibrary}>
          Choose a photo
        </Button>
        {shown && !busy ? (
          <Button
            variant="ghost"
            size="sm"
            className="cf-none"
            onClick={() => {
              setError('');
              onChange('', { kind: 'none' });
            }}
          >
            No photo
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="cf-err" role="alert">{error}</p>
      ) : null}
      <p className="cf-help" id={helpId} aria-live="polite">{help}</p>
    </div>
  );
}
