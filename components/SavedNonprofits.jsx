'use client';

/* ==========================================================================
   SavedNonprofits.jsx, the nonprofits on the Saved page.

   A nonprofit is saved from its page as "np:<ein>" in the same saved list
   as listings (so it syncs and moves from a guest copy the same way). Each
   row loads the IRS record for its name and town and links back to
   /nonprofits/<ein>.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { S } from '../lib/style.js';
import { C } from '../lib/tokens.js';
import { toggleSaved } from '../lib/db.js';
import { toast } from '../lib/overlays.js';
import { NonprofitRow } from './vu/index.js';
import { titleCase, causeText, placeText, formatEin } from './WebNonprofits.jsx';
import { Icon } from './ui.jsx';

export const NP_PREFIX = 'np:';
export const isNonprofitId = (id) => String(id || '').startsWith(NP_PREFIX);
const einOf = (id) => String(id).slice(NP_PREFIX.length).replace(/\D/g, '');

/** IRS records by EIN: organization, null when it's gone, undefined when the read failed. */
function useRecords(eins) {
  const key = eins.join('|');
  const [recs, setRecs] = useState(() => new Map());
  useEffect(() => {
    let alive = true;
    const missing = eins.filter((e) => !recs.has(e));
    if (!missing.length) return undefined;
    Promise.all(
      missing.map((e) =>
        fetch(`/api/nonprofits?ein=${encodeURIComponent(e)}`)
          .then((r) => (r.status === 404 || r.status === 400 ? { gone: true } : r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
          .then((d) => [e, d && d.organization ? d.organization : null])
          .catch((err) => {
            console.error('[saved] nonprofit record failed', e, err);
            return [e, undefined];
          })
      )
    ).then((pairs) => {
      if (!alive) return;
      setRecs((prev) => {
        const next = new Map(prev);
        pairs.forEach(([e, v]) => next.set(e, v));
        return next;
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return recs;
}

export default function SavedNonprofits({ ids, withHeading }) {
  const eins = ids.map(einOf).filter(Boolean);
  const recs = useRecords(eins);
  if (!eins.length) return null;

  function remove(id, name) {
    toggleSaved(id);
    toast({ title: 'Removed from saved', message: name, tone: 'brand', actionLabel: 'Undo', onAction: () => toggleSaved(id) });
  }

  return (
    <section aria-label="Saved nonprofits" style={S(withHeading ? 'margin-top:56px' : '')}>
      {withHeading ? <h2 className="vu-t-h3s" style={S(`margin:0 0 12px;color:${C.ink}`)}>Nonprofits</h2> : null}
      <style>{'.vu-saved-np > li { border-bottom:1px solid var(--line); } .vu-saved-np .vu-np { border-bottom:0; }'}</style>
      <ul className="vu-list vu-saved-np" style={S('margin:0;padding:0;list-style:none')}>
        {ids.map((id) => {
          const ein = einOf(id);
          const o = recs.get(ein);
          const name = o ? titleCase(o.name) : `Nonprofit ${formatEin(ein)}`;
          return (
            <li key={id} style={S('display:flex;align-items:center;gap:8px;min-width:0')}>
              <div style={S('flex:1;min-width:0')}>
                <NonprofitRow
                  name={name}
                  parts={o ? [causeText(o.cause), placeText(o)] : [o === null ? 'No longer in IRS records' : '']}
                  href={`/nonprofits/${ein}`}
                />
              </div>
              <button
                type="button"
                aria-label={`Remove ${name} from saved`}
                onClick={() => remove(id, name)}
                className="vu-iconbtn-sm"
                style={S('width:36px;height:36px;border:0;cursor:pointer')}
              >
                <Icon name="x" size={18} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
