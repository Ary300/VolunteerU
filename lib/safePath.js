/**
 * Returns `raw` when it is a path on this site, or '' otherwise.
 *
 * Used for ?next= redirects. Browsers drop tab and newline characters while
 * parsing URLs, so '/\t/evil.example' becomes '//evil.example'. Any control
 * character or backslash is rejected before the prefix checks. The value is
 * then resolved against a base URL, which removes dot segments
 * ('/.//evil.example', '/x/..//evil.example' and '/%2e//evil.example' all
 * normalise to '//evil.example'), and the normalised path goes through the
 * same checks again. A protocol-relative result would leave the site when the
 * router navigates to it, so it is rejected.
 */
const FALLBACK_BASE = 'http://same-site.invalid';

function isUnsafe(v) {
  // eslint-disable-next-line no-control-regex
  if (!v || /[\u0000-\u001F\u007F\\]/.test(v)) return true;
  return !v.startsWith('/') || v.startsWith('//');
}

export function sameSitePath(raw) {
  const v = String(raw || '');
  if (isUnsafe(v)) return '';
  const base = typeof window === 'undefined' ? FALLBACK_BASE : window.location.origin;
  try {
    const u = new URL(v, base);
    if (u.origin !== new URL(base).origin) return '';
    const out = `${u.pathname}${u.search}${u.hash}`;
    if (isUnsafe(out)) return '';
    // The normalised path must resolve to itself on this origin.
    const again = new URL(out, base);
    if (again.origin !== u.origin || again.pathname !== u.pathname) return '';
    return out;
  } catch {
    return '';
  }
}
