'use client';

/* ==========================================================================
   ShareHoursCard, the hour record a student screenshots or shares. It reads
   like a printed ticket: white, a 1px line, the logo and school year on top,
   the confirmed number, then a dashed tear line over the name, grade,
   school and main cause. Save image draws the card as a PNG (lib/hoursCardImage.js).
   Copy caption and Copy VolunteerU link write to the
   clipboard and say so. The link is the site itself, so the label names it. The number is confirmed hours only, never self-logged ones.
   With nothing confirmed yet there's no card, just one sentence (bare
   mode draws the card empty instead, for the landing page).
   ========================================================================== */

import { useRef, useState } from 'react';
import { S } from '../../lib/style.js';
import { C, F, R, causeOf } from '../../lib/tokens.js';
import { copyText, download } from '../../lib/db.js';
import { hoursCardPng } from '../../lib/hoursCardImage.js';
import { toast } from '../../lib/overlays.js';
import { Button } from '../ui.jsx';
import { fmtHours } from './HoursSummary.jsx';
import { Sep } from './ListingCard.jsx';

/** School year containing `d`: Aug onward is the next year's class. "2026 to 2027". */
export function schoolYearLabel(d = new Date()) {
  const y = d.getFullYear();
  const start = d.getMonth() >= 7 ? y : y - 1;
  return `${start} to ${start + 1}`;
}

/** The default share caption. Wording matches the Profile screen's. */
export function shareCaption(confirmed, link) {
  const n = Number(fmtHours(confirmed));
  return n > 0
    ? `${fmtHours(n)} ${n === 1 ? 'hour' : 'hours'} of volunteering confirmed by organizers on VolunteerU. ${link}`
    : `Finding places to volunteer on VolunteerU. ${link}`;
}

/**
 * @param {object} props
 * @param {string} props.name
 * @param {number} props.confirmed      confirmed hours (organizer-confirmed only)
 * @param {string|number} [props.grade] "11"
 * @param {string} [props.school]
 * @param {string} [props.schoolYear]   top-right label; defaults to the current school year
 * @param {string} [props.mainCause]    any cause string; printed as "Mostly food and hunger"
 * @param {string} [props.link]         defaults to this site's origin
 * @param {string} [props.caption]      overrides the default caption
 * @param {boolean} [props.bare]        the card alone, without the caption and copy buttons. With
 *                                      nothing confirmed it still draws the card, empty, with a
 *                                      sentence where the number goes (the landing page uses this)
 */
export default function ShareHoursCard({ name, confirmed = 0, grade, school, schoolYear, mainCause, link, caption, bare = false, className }) {
  const [busy, setBusy] = useState('');
  const url = link || (typeof window !== 'undefined' ? window.location.origin : 'https://www.volunteeruapp.com');
  const text = caption || shareCaption(confirmed, url);
  const cause = mainCause ? causeOf(mainCause) : null;
  const year = schoolYear || schoolYearLabel();
  const n = Number(fmtHours(confirmed));
  const who = [grade ? `Grade ${grade}` : null, school || null, cause && cause.label !== 'Other' ? `Mostly ${cause.label.toLowerCase()}` : null].filter(Boolean);

  const numRef = useRef(null);
  const figRef = useRef(null);

  // Save image: the card as a PNG. On a phone that can share files, the share
  // sheet opens with the image and caption; elsewhere the PNG downloads.
  const saveImage = async () => {
    setBusy('image');
    try {
      const png = await hoursCardPng({
        name: name || 'Your name',
        hours: fmtHours(confirmed),
        unit: `${n === 1 ? 'hour' : 'hours'} confirmed by organizers`,
        year,
        details: who,
        displayFont: numRef.current ? getComputedStyle(numRef.current).fontFamily : '',
        bodyFont: figRef.current ? getComputedStyle(figRef.current).fontFamily : '',
      });
      if (!png) throw new Error('no image');
      const file = new File([png], 'volunteeru-hours.png', { type: 'image/png' });
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      download('volunteeru-hours.png', png, 'image/png');
      toast({ title: 'Image saved', message: 'Your hours card is in your downloads.', tone: 'ok' });
    } catch (err) {
      console.error('[share] could not make the card image', err);
      toast({ title: "Couldn't save the image", message: 'Take a screenshot of the card instead.', tone: 'warn' });
    } finally {
      setBusy('');
    }
  };

  const copy = async (kind) => {
    setBusy(kind);
    const ok = await copyText(kind === 'caption' ? text : url);
    setBusy('');
    toast(
      ok
        ? { title: kind === 'caption' ? 'Caption copied' : 'Link copied', tone: 'ok' }
        : { title: "Couldn't copy", message: 'Select the text and copy it yourself.', tone: 'warn' }
    );
  };

  if (!(n > 0) && !bare) {
    return (
      <div className={className}>
        <p style={S(`margin:0;font:400 15px/1.5 ${F.body};color:${C.ink2};max-width:420px`)}>Your card fills in once an organizer confirms your first hours.</p>
        <div style={S('display:flex;gap:10px;margin-top:12px;flex-wrap:wrap')}>
          <Button variant="outline" size="sm" icon="link" busy={busy === 'link'} onClick={() => copy('link')}>
            Copy VolunteerU link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <figure
        ref={figRef}
        aria-label={`${name || 'Your'} hours card`}
        style={S(`margin:0;position:relative;overflow:hidden;border-radius:${R.card};background:#fff;border:1px solid ${C.line2};color:${C.ink};padding:22px 22px 20px`)}
      >
        <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px')}>
          <span style={S(`display:inline-flex;align-items:center;gap:8px;font:700 15px/1 ${F.display};letter-spacing:-0.02em;color:${C.ink}`)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" height={20} style={{ height: 20, width: 'auto', display: 'block' }} />
            VolunteerU
          </span>
          <span style={S(`font:500 13px/1 ${F.body};color:${C.ink2};font-variant-numeric:tabular-nums`)}>{year}</span>
        </div>
        {n > 0 ? (
        <div style={S('display:flex;align-items:flex-end;gap:14px;margin-top:24px')}>
          <b ref={numRef} style={S(`font:800 72px/.85 ${F.display};letter-spacing:-0.05em;font-variant-numeric:tabular-nums;color:${C.ink}`)}>{fmtHours(confirmed)}</b>
          <span style={S(`font:500 15px/1.3 ${F.body};color:${C.ink2};padding-bottom:2px;max-width:150px`)}>
            {n === 1 ? 'hour' : 'hours'} confirmed by organizers
          </span>
        </div>
        ) : (
          /* Empty card: no 0, just what will fill the space. */
          <p style={S(`margin:28px 0 0;max-width:260px;font:500 17px/1.35 ${F.body};color:${C.ink2}`)}>Hours show up here once an organizer confirms them.</p>
        )}
        <figcaption style={S(`margin-top:20px;padding-top:14px;border-top:1px dashed ${C.line2}`)}>
          <span className="vu-trunc" style={S(`display:block;font:650 18px/1.2 ${F.display};letter-spacing:-0.012em;color:${name ? C.ink : C.ink3}`)}>{name || 'Your name'}</span>
          {who.length ? (
            <span style={S(`display:block;margin-top:4px;font:400 14px/1.4 ${F.body};color:${C.ink2}`)}>
              {who.map((w, i) => (
                <span key={i}>
                  {i ? <Sep /> : null}
                  {w}
                </span>
              ))}
            </span>
          ) : null}
        </figcaption>
      </figure>
      {bare ? null : (
      <>
      <p style={S(`margin:14px 0 0;font:400 14px/1.45 ${F.body};color:${C.ink2};overflow-wrap:anywhere`)}>{text}</p>
      <div style={S('display:flex;gap:10px;margin-top:14px;flex-wrap:wrap')}>
        {n > 0 ? (
          <Button variant="dark" icon="download" busy={busy === 'image'} onClick={saveImage}>
            Save image
          </Button>
        ) : null}
        <Button variant="outline" icon="copy" busy={busy === 'caption'} onClick={() => copy('caption')}>
          Copy caption
        </Button>
        <Button variant="outline" icon="link" busy={busy === 'link'} onClick={() => copy('link')}>
          Copy VolunteerU link
        </Button>
      </div>
      </>
      )}
    </div>
  );
}
