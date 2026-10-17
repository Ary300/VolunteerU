/**
 * Returns `raw` when it is a path on this site, or '' otherwise.
 *
 * Used for ?next= redirects. Browsers drop tab and newline characters while
 * parsing URLs, so '/\t/evil.example' becomes '//evil.example'. Any control
 * character or backslash is rejected before the prefix checks, and the value
 * is then resolved against this origin so nothing can leave the site.
 */
export function sameSitePath(raw) {
  const v = String(raw || '');
  // eslint-disable-next-line no-control-regex
  if (!v || /[\u0000-\u001F\u007F\\]/.test(v)) return '';
  if (!v.startsWith('/') || v.startsWith('//')) return '';
  if (typeof window === 'undefined') return v;
  try {
    const u = new URL(v, window.location.origin);
    if (u.origin !== window.location.origin) return '';
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return '';
  }
}
