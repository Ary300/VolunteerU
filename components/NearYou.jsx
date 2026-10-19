'use client';

/* ==========================================================================
   NearYou.jsx, the one line that asks where the visitor is.

   Sits in the page flow under a search bar (Discover, the landing page). It
   is never a dialog and never asks the browser on its own: the browser's
   location prompt opens only from "Use my location". When the site already
   has location permission, the town is filled in quietly.

     not chosen   See what's near you  [Use my location]  Enter a ZIP or town
     chosen       Near Carmel, IN  ·  Change
     typing       [ZIP or town      ] [Show results] (locate) (x)
     denied       Showing Indianapolis. Location is off.  Enter a ZIP or town

   Every state is one line of the same height, and the line is drawn empty
   (same height) until the browser's storage has been read, so nothing below
   it moves when it fills in. A message after a failed try goes on a second
   line, which only ever appears after a tap.

   Props
     area        the visitor's area as the page uses it ("Carmel, IN"): a
                 signed-in volunteer's saved area, else this browser's
                 location, else '' (nothing chosen)
     fallback    the town shown when nothing is chosen ("Indianapolis")
     ask         a number; when it goes up and nothing is chosen, the line
                 asks the browser (the page's own "Near you" was tapped)
     onChange    (rec, { quiet }) after a location is set, by a tap or quietly
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { S } from '../lib/style.js';
import { C, F, R } from '../lib/tokens.js';
import { Button, Icon } from './ui.jsx';
import { useLocation, locateMe, lookupPlace, geoPermission, areaOf, placeLabel, GPS_STALE_MS, LOCATE_ERRORS } from '../lib/location.js';

const CSS = `
.vu-near { display:flex; align-items:center; gap:10px 14px; min-height:40px; min-width:0; font:400 14px/1.35 ${F.body}; color:${C.ink2}; }
.vu-near-lead { display:inline-flex; align-items:center; gap:8px; font:600 15px/1.3 ${F.body}; color:${C.ink}; white-space:nowrap; }
.vu-near-area { color:${C.ink}; font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vu-near-link { flex:none; background:none; border:0; padding:0; cursor:pointer; font:500 14px/1.3 ${F.body}; color:${C.ink}; text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1px; white-space:nowrap; }
.vu-near-form { display:flex; align-items:center; gap:8px; flex:1; min-width:0; max-width:560px; }
.vu-near-input { flex:1; min-width:0; height:36px; padding:0 14px; border-radius:${R.pill}; border:1px solid ${C.line2}; background:#fff; font:400 15px/1 ${F.body}; color:${C.ink}; }
.vu-near-input:focus-visible { outline:2px solid ${C.ink}; outline-offset:1px; }
.vu-near-ic { flex:none; width:36px; height:36px; display:inline-grid; place-items:center; border-radius:50%; border:0; background:none; color:${C.ink}; cursor:pointer; }
.vu-near-msg { margin-top:6px; font:400 13px/1.45 ${F.body}; color:${C.ink2}; max-width:640px; }
.vu-near-msg.is-err { color:${C.emberDeep}; }
@media (hover:hover) { .vu-near-link:hover { text-decoration-thickness:2px; } .vu-near-ic:hover { background:${C.mist}; } }
@media (max-width: 559px) {
  .vu-near-lead-text { display:none; }
  .vu-near-go-label { display:none; }
}
`;

/**
 * @param {{ area?: string, fallback?: string, ask?: number, onChange?: (rec:object, how:{quiet?:boolean})=>void, className?: string, style?: object }} props
 */
export default function NearYou({ area: givenArea = '', fallback = 'Indianapolis', ask = 0, onChange, className, style }) {
  const loc = useLocation();
  const [mode, setMode] = useState('idle'); // idle | locating | quiet | typing | looking
  const [text, setText] = useState('');
  const [msg, setMsg] = useState({ text: '', err: false });
  // The browser has location blocked for this site (permissions.query says
  // 'denied'): "Use my location" could only fail, so it isn't offered.
  const [blocked, setBlocked] = useState(false);
  const inputRef = useRef(null);
  const quietTried = useRef(false);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const set = loc && loc.status === 'set' ? loc : null;
  const denied = blocked || (loc && loc.status === 'denied');
  const area = String(givenArea || '').trim() || (set ? areaOf(set) : '');
  // This browser's own location reads back with its ZIP ("Indianapolis, IN
  // 46220"), so a typed ZIP visibly took effect.
  const shownArea = set && area.toLowerCase() === areaOf(set).toLowerCase() ? placeLabel(set) : area;

  // With permission already given, fill the location in without asking: on a
  // first visit, after "Location is off" was fixed in the browser, or when a
  // location from the browser is old. A volunteer with a saved area keeps it
  // (the page decides, see onChange's `quiet`); the point still helps with
  // distances in that town.
  useEffect(() => {
    if (loc === undefined || quietTried.current) return undefined;
    const stale = set && set.source === 'gps' && Date.now() - (set.at || 0) > GPS_STALE_MS;
    // Once per mount, and not cancelled by a re-run (React's dev double
    // effects): the answer is stored for the whole site either way.
    quietTried.current = true;
    geoPermission().then((p) => {
      if (p === 'denied') {
        setBlocked(true);
        return;
      }
      if (set && !stale) return;
      if (p !== 'granted') return;
      // Only an empty line says it's looking; a chosen area stays on screen.
      if (!area) setMode('quiet');
      locateMe().then((res) => {
        setMode((m) => (m === 'quiet' ? 'idle' : m));
        if (res.ok && changeRef.current) changeRef.current(res.rec, { quiet: true });
      });
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc === undefined]);

  // The page's own "Near you" was tapped with nothing chosen: ask now (a tap
  // started it, so the browser's prompt isn't out of the blue).
  const lastAsk = useRef(ask);
  useEffect(() => {
    if (ask === lastAsk.current) return;
    lastAsk.current = ask;
    if (area || mode !== 'idle') return;
    if (denied) startTyping();
    else askBrowser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  useEffect(() => {
    if (mode === 'typing' && inputRef.current) inputRef.current.focus();
  }, [mode]);

  async function askBrowser() {
    setMsg({ text: '', err: false });
    setMode('locating');
    const res = await locateMe();
    if (res.ok) {
      setMode('idle');
      if (onChange) onChange(res.rec);
      return;
    }
    // A refusal or failure falls back to the ZIP field, saying why.
    if (res.error === 'denied') geoPermission().then((p) => setBlocked(p === 'denied'));
    setMode('typing');
    setMsg({ text: LOCATE_ERRORS[res.error] || LOCATE_ERRORS.unavailable, err: res.error !== 'denied' });
  }

  async function submit(e) {
    e.preventDefault();
    setMsg({ text: '', err: false });
    setMode('looking');
    const res = await lookupPlace(text);
    if (res.ok) {
      setText('');
      setMode('idle');
      if (onChange) onChange(res.rec);
      return;
    }
    setMode('typing');
    setMsg({ text: LOCATE_ERRORS[res.error] || LOCATE_ERRORS.notfound, err: true });
  }

  function startTyping() {
    setMsg({ text: '', err: false });
    setMode('typing');
  }

  function cancel() {
    setMsg({ text: '', err: false });
    setText('');
    setMode('idle');
  }

  let line;
  if (loc === undefined) {
    line = null; // the line keeps its height until storage is read
  } else if (mode === 'typing' || mode === 'looking') {
    line = (
      <form className="vu-near-form" onSubmit={submit} role="search" aria-label="Your ZIP or town">
        <input
          ref={inputRef}
          className="vu-near-input"
          type="text"
          inputMode="text"
          autoComplete="postal-code"
          aria-label="ZIP or town"
          placeholder="ZIP or town"
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Escape') cancel(); }}
          maxLength={80}
        />
        <Button type="submit" size="sm" variant="dark" icon="search" busy={mode === 'looking'} aria-label="Show results">
          <span className="vu-near-go-label">Show results</span>
        </Button>
        {blocked ? null : (
          <button type="button" className="vu-near-ic" aria-label="Use my location" title="Use my location" onClick={askBrowser}>
            <Icon name="crosshair" size={18} />
          </button>
        )}
        <button type="button" className="vu-near-ic" aria-label="Cancel" title="Cancel" onClick={cancel}>
          <Icon name="x" size={18} />
        </button>
      </form>
    );
  } else if (mode === 'locating' || mode === 'quiet') {
    line = (
      <span className="vu-near-lead" role="status">
        <Icon name="crosshair" size={18} />
        Finding places near you
      </span>
    );
  } else if (area) {
    line = (
      <>
        <span className="vu-near-lead" style={S('min-width:0')}>
          <Icon name={set && set.source === 'gps' ? 'navigation' : 'pin'} size={18} />
          <span style={S('min-width:0;display:flex;gap:5px;align-items:baseline')}>
            <span style={S(`font-weight:400;color:${C.ink2}`)}>Near</span>
            <span className="vu-near-area">{shownArea}</span>
          </span>
        </span>
        <button type="button" className="vu-near-link" onClick={startTyping} aria-label={`Change your location, now ${shownArea}`}>
          Change
        </button>
      </>
    );
  } else if (denied) {
    line = (
      <>
        <span className="vu-near-lead" style={S('min-width:0')}>
          <Icon name="pin" size={18} />
          <span className="vu-near-area">Showing {fallback}</span>
        </span>
        <button type="button" className="vu-near-link" onClick={startTyping}>
          Enter a ZIP or town
        </button>
      </>
    );
  } else {
    line = (
      <>
        <span className="vu-near-lead">
          <Icon name="pin" size={18} />
          <span className="vu-near-lead-text">See what&apos;s near you</span>
        </span>
        <Button size="sm" variant="dark" icon="crosshair" onClick={askBrowser}>
          Use my location
        </Button>
        <button type="button" className="vu-near-link" onClick={startTyping}>
          Enter a ZIP or town
        </button>
      </>
    );
  }

  return (
    <div className={className} style={style}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="vu-near" aria-busy={loc === undefined ? 'true' : undefined}>
        {line}
      </div>
      {msg.text ? (
        <p className={msg.err ? 'vu-near-msg is-err' : 'vu-near-msg'} role={msg.err ? 'alert' : 'status'} style={S('margin-bottom:0')}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
