'use client';

/* ==========================================================================
   SearchBar, the What / Where / When pill that leads Landing, Home and
   Discover. Fully controlled: the screen owns the values and the search.

   variant="bar"        desktop pill; stacks into a panel under 720px
   variant="stacked"    always the stacked panel (landing on phones)
   variant="collapsed"  one pill showing the current query, with a filter
                        button and count (Discover on phones). Tapping the
                        pill calls onExpand.
   Layout and states live in globals.css (.vu-sb*), so the responsive switch
   works without JS.
   ========================================================================== */

import { useId } from 'react';
import { Icon } from '../ui.jsx';

export const WHEN_OPTIONS = [
  { v: '', l: 'Any day' },
  { v: 'today', l: 'Today' },
  { v: 'week', l: 'This week' },
  { v: 'weekend', l: 'This weekend' },
  { v: 'month', l: 'This month' },
];

/**
 * @param {object} props
 * @param {string} [props.what]  @param {(v:string)=>void} [props.onWhat]
 * @param {string} [props.where] @param {(v:string)=>void} [props.onWhere]
 * @param {string} [props.when]  @param {(v:string)=>void} [props.onWhen]
 * @param {(values:{what:string,where:string,when:string})=>void} props.onSubmit
 * @param {Array<{v:string,l:string}>} [props.whenOptions]
 * @param {Array<'what'|'where'|'when'>} [props.fields]
 * @param {'bar'|'stacked'|'collapsed'} [props.variant]
 * @param {string} [props.idPrefix] fixed field ids ("lp-search" -> "lp-search-what"),
 *   for a bar whose ids must not depend on where it sits in the tree
 */
export default function SearchBar({
  what = '',
  where = '',
  when = '',
  onWhat,
  onWhere,
  onWhen,
  onSubmit,
  whenOptions = WHEN_OPTIONS,
  fields = ['what', 'where', 'when'],
  variant = 'bar',
  whatPlaceholder = 'Food bank, tutoring, animal shelter',
  wherePlaceholder = 'City or ZIP code',
  whatLabel = 'What',
  whereLabel = 'Where',
  whenLabel = 'When',
  submitLabel = 'Search',
  busyLabel = 'Searching',
  busy = false,
  label = 'Search opportunities',
  // collapsed variant
  onExpand,
  onFilters,
  filterCount = 0,
  filtersLabel = 'Filters',
  summary,
  className,
  idPrefix = '',
}) {
  const auto = useId();
  const uid = idPrefix || auto;
  const whenText = (whenOptions.find((o) => o.v === when) || {}).l || '';

  if (variant === 'collapsed') {
    const title = what || 'Search opportunities';
    const sub = summary || [where, when ? whenText : ''].filter(Boolean).join(', ') || 'Anywhere, any day';
    return (
      <div className={['vu-sb-pill', className].filter(Boolean).join(' ')} role="search" aria-label={label}>
        <button type="button" className="vu-sb-pill-main" onClick={onExpand} aria-label={`Edit search: ${title}, ${sub}`}>
          <Icon name="search" size={20} />
          <span className="vu-sb-pill-text">
            <b className="vu-trunc">{title}</b>
            <span className="vu-trunc">{sub}</span>
          </span>
        </button>
        {onFilters ? (
          <button type="button" className="vu-sb-filter" onClick={onFilters} aria-label={filterCount ? `${filtersLabel}, ${filterCount} on` : filtersLabel}>
            <Icon name="filter" size={18} />
            {filterCount ? <i aria-hidden="true">{filterCount}</i> : null}
          </button>
        ) : null}
      </div>
    );
  }

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    onSubmit && onSubmit({ what: String(what || '').trim(), where: String(where || '').trim(), when });
  };

  return (
    <form role="search" aria-label={label} onSubmit={submit} className={['vu-sb', variant === 'stacked' ? 'vu-sb--stacked' : '', className].filter(Boolean).join(' ')}>
      {fields.includes('what') ? (
        <label className="vu-sb-seg vu-sb-seg--what" htmlFor={`${uid}-what`}>
          <span className="vu-sb-ic" aria-hidden="true"><Icon name="search" size={20} /></span>
          <span className="vu-sb-body">
            <span className="vu-sb-label">{whatLabel}</span>
            <input
              id={`${uid}-what`}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={what}
              placeholder={whatPlaceholder}
              onChange={(e) => onWhat && onWhat(e.target.value)}
              className="vu-sb-input"
            />
          </span>
        </label>
      ) : null}
      {fields.includes('where') ? (
        <label className="vu-sb-seg vu-sb-seg--where" htmlFor={`${uid}-where`}>
          <span className="vu-sb-ic" aria-hidden="true"><Icon name="pin" size={20} /></span>
          <span className="vu-sb-body">
            <span className="vu-sb-label">{whereLabel}</span>
            <input
              id={`${uid}-where`}
              type="text"
              autoComplete="postal-code"
              value={where}
              placeholder={wherePlaceholder}
              onChange={(e) => onWhere && onWhere(e.target.value)}
              className="vu-sb-input"
            />
          </span>
        </label>
      ) : null}
      {fields.includes('when') ? (
        <label className="vu-sb-seg vu-sb-seg--when" htmlFor={`${uid}-when`}>
          <span className="vu-sb-ic" aria-hidden="true"><Icon name="calendar" size={20} /></span>
          <span className="vu-sb-body">
            <span className="vu-sb-label">{whenLabel}</span>
            <select id={`${uid}-when`} value={when} onChange={(e) => onWhen && onWhen(e.target.value)} className="vu-sb-input vu-sb-select" data-set={when ? 'true' : 'false'}>
              {whenOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </span>
        </label>
      ) : null}
      <button type="submit" className="vu-sb-go" data-busy={busy ? 'true' : undefined} aria-busy={busy ? 'true' : undefined}>
        {busy ? <span className="vu-spin" aria-hidden="true" /> : <Icon name="search" size={20} />}
        <span>{busy ? busyLabel : submitLabel}</span>
      </button>
    </form>
  );
}
