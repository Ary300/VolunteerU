'use client';

/* ==========================================================================
   ListingLinks.jsx, the fields a lead fills in so volunteers can reach the
   organization outside VolunteerU: its own sign-up form and, for a
   registered nonprofit, its IRS EIN. Used by /create (Step 1) and the lead's
   Edit details dialog. The join page reads what they save through
   lib/listings.js listingSignup and listingNonprofitHref.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S } from '../lib/style.js';
import { C, F } from '../lib/tokens.js';
import { Field, Checkbox } from './ui.jsx';
import { httpLink, einDigits } from '../lib/listings.js';
import { titleCase } from './WebNonprofits.jsx';

const LOOKUP_DELAY_MS = 500;

/** The error for a typed sign-up form link, or ''. */
export function signupLinkError(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  return httpLink(v) ? '' : 'Paste the full link to the form, starting with https://';
}

/** The error for a typed EIN, or ''. `check` is the lookup NonprofitEinField
    saved ({ ein, status }), so an EIN the IRS has no record of is refused. */
export function einError(raw, check) {
  const v = String(raw || '').trim();
  if (!v) return '';
  const ein = einDigits(v);
  if (!ein) return 'Enter the 9-digit EIN, like 35-1044585.';
  if (check && check.ein === ein && check.status === 'missing') return 'The IRS has no nonprofit with that EIN. Check it, or leave it blank.';
  return '';
}

/** "Sign-up form link" plus "Spots are held only through this form". */
export function SignupLinkFields({ url = '', only = false, onChange, error, id = 'signup-url' }) {
  const hasUrl = !!String(url || '').trim();
  return (
    <div>
      <Field
        id={id}
        label="Sign-up form link"
        value={url}
        onChange={(v) => onChange({ signupUrl: v, signupOnly: v.trim() ? only : false })}
        placeholder="Optional, e.g. https://forms.gle/..."
        type="url"
        inputMode="url"
        maxLength={500}
        error={error}
        hint="Already take sign-ups on Google Forms, SignUpGenius or your own site? Volunteers get this link next to Apply."
      />
      {hasUrl ? (
        <div style={S('margin-top:14px')}>
          <Checkbox
            id={`${id}-only`}
            checked={only}
            onChange={(v) => onChange({ signupUrl: url, signupOnly: v })}
            label="Spots are held only through this form"
          />
          <p style={S(`margin:6px 0 0 32px;font:400 13px/1.45 ${F.body};color:${C.ink2}`)}>
            Volunteers are told to fill it out. They still apply here so their shifts and hours are tracked.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* The IRS record for an EIN: { status: 'ok', name, place } | { status: 'missing' }
   | { status: 'error' } when the lookup couldn't run. */
async function lookupEin(ein, signal) {
  try {
    const res = await fetch(`/api/nonprofits?ein=${ein}`, { signal });
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'error' };
    const body = await res.json();
    const o = body && body.organization;
    if (!o || !o.name) return { status: 'missing' };
    return { status: 'ok', name: titleCase(o.name), place: [titleCase(o.city), o.state].filter(Boolean).join(', ') };
  } catch (err) {
    if (err && err.name === 'AbortError') return null;
    return { status: 'error' };
  }
}

/** The nonprofit's EIN, checked against its IRS record as it's typed.
    onCheck receives { ein, status } so the form can refuse an unknown EIN. */
export function NonprofitEinField({ value = '', onChange, onCheck, error, id = 'nonprofit-ein', label = 'IRS EIN', partner = false }) {
  const ein = einDigits(value);
  const [found, setFound] = useState(null); // { ein, status, name, place }
  useEffect(() => {
    if (!ein) { setFound(null); return undefined; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const r = await lookupEin(ein, ctrl.signal);
      if (!r) return;
      setFound({ ein, ...r });
      if (onCheck) onCheck({ ein, status: r.status });
    }, LOOKUP_DELAY_MS);
    return () => { clearTimeout(t); ctrl.abort(); };
    // onCheck is a fresh closure each render; the lookup only depends on the EIN.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ein]);
  const current = found && found.ein === ein ? found : null;
  let hint = partner
    ? "Your listing links to the partner's nonprofit page, built from IRS records."
    : 'Optional. Your listing links to your nonprofit page, built from IRS records.';
  if (ein && !current) hint = 'Looking up the IRS record';
  else if (current && current.status === 'ok') hint = `IRS record: ${current.name}${current.place ? `, ${current.place}` : ''}`;
  else if (current && current.status === 'error') hint = "Couldn't reach the IRS records right now. The EIN still saves.";
  return (
    <Field
      id={id}
      label={label}
      value={value}
      onChange={(v) => onChange(v.replace(/[^\d-]/g, '').slice(0, 10))}
      placeholder="e.g. 35-1044585"
      inputMode="numeric"
      maxLength={10}
      error={error || (current && current.status === 'missing' ? 'The IRS has no nonprofit with that EIN. Check it, or leave it blank.' : '')}
      hint={hint}
    />
  );
}
