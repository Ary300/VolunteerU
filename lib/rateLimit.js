/* ==========================================================================
   rateLimit.js, the per-IP limit the API routes share. Server code only.

     const limit = rateLimiter({ max: 90 });      // 90 a minute per IP
     if (limit(clientIp(request))) return 429;

   Each limiter keeps its own counts in memory (one serverless instance, so
   it stops one client from flooding an upstream queue, not a botnet). Call
   it only for requests that would reach an upstream, so a page that redraws
   from cached answers never uses it up.
   ========================================================================== */

const WINDOW_MS = 60_000;
const MAX_IPS = 5000;

/** The visitor's IP from the proxy headers ('local' in development). */
export function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
}

/**
 * A limiter allowing `max` calls per IP in a sliding `windowMs`. The
 * returned function records a call and returns true when this one is over
 * the limit (and isn't counted).
 * @param {{ max: number, windowMs?: number }} opts
 * @returns {(ip: string, now?: number) => boolean}
 */
export function rateLimiter({ max, windowMs = WINDOW_MS }) {
  const hits = new Map(); // ip -> timestamps in the current window
  return function overLimit(ip, now = Date.now()) {
    const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(ip, recent);
      return true;
    }
    hits.delete(ip);
    hits.set(ip, [...recent, now]);
    if (hits.size > MAX_IPS) hits.delete(hits.keys().next().value);
    return false;
  };
}
