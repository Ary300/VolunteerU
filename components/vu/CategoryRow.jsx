'use client';

/* ==========================================================================
   CategoryRow, icon-above-label causes under the search bar. No boxes: the
   active one is ink with a 2px underline, the rest ink2, one rule under the
   whole row. Scrolls sideways on phones.
   ========================================================================== */

import Link from 'next/link';
import { Icon } from '../ui.jsx';
import { CATEGORIES } from '../../lib/tokens.js';

/**
 * @param {object} props
 * @param {string} props.value active category key ('near', 'food', ...)
 * @param {(key:string, item:object)=>void} [props.onChange] button mode
 * @param {(item:object)=>string} [props.hrefFor] link mode (renders next/link)
 * @param {Array} [props.items] defaults to CATEGORIES from lib/tokens.js
 * @param {boolean} [props.short] use the short label ("Food") where one exists
 */
export default function CategoryRow({ value, onChange, hrefFor, items = CATEGORIES, short = false, label = 'Causes', className }) {
  return (
    <div className={['vu-cats', 'vu-scroll-x', className].filter(Boolean).join(' ')} role="group" aria-label={label}>
      {items.map((it) => {
        const on = it.key === value;
        const text = short && it.short ? it.short : it.label;
        const inner = (
          <>
            <Icon name={it.icon} size={24} />
            <span>{text}</span>
          </>
        );
        if (hrefFor) {
          return (
            <Link key={it.key} href={hrefFor(it)} className={on ? 'vu-cat is-on' : 'vu-cat'} aria-current={on ? 'true' : undefined}>
              {inner}
            </Link>
          );
        }
        return (
          <button key={it.key} type="button" className={on ? 'vu-cat is-on' : 'vu-cat'} aria-pressed={on ? 'true' : 'false'} onClick={() => onChange && onChange(it.key, it)}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
