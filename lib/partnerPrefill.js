/* ==========================================================================
   partnerPrefill.js, "Start a student project with them" from a nonprofit
   page. The link carries the nonprofit's name, street and town to /create,
   and the wizard puts them in its Site field so the project starts with that
   nonprofit as the place it happens.
   ========================================================================== */

const SITE_MAX = 90; // the wizard's Site field limit
const PARAMS = ['partner', 'partner_street', 'partner_city', 'partner_state', 'partner_ein'];

const clean = (v, max = 90) => String(v || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * /create link for a nonprofit partner.
 * @param {{ name: string, street?: string, city?: string, state?: string, ein?: string|number }} p
 */
export function partnerHref({ name, street = '', city = '', state = '', ein = '' }) {
  const q = new URLSearchParams();
  q.set('partner', clean(name, 80));
  if (street) q.set('partner_street', clean(street, 80));
  if (city) q.set('partner_city', clean(city, 40));
  if (state) q.set('partner_state', clean(state, 2));
  if (ein) q.set('partner_ein', String(ein).replace(/\D/g, '').slice(0, 9));
  return `/create?${q.toString()}`;
}

/**
 * The partner in a /create URL, or null. `site` is what goes in the Site
 * field: "Name, street, City, ST", shortened to fit by dropping the street.
 * @param {string} search  window.location.search
 */
export function readPartner(search) {
  let p;
  try {
    p = new URLSearchParams(search || '');
  } catch {
    return null;
  }
  const name = clean(p.get('partner'), 80);
  if (!name) return null;
  const street = clean(p.get('partner_street'), 80);
  const city = clean(p.get('partner_city'), 40);
  const state = /^[A-Za-z]{2}$/.test(p.get('partner_state') || '') ? p.get('partner_state').toUpperCase() : '';
  const ein = (p.get('partner_ein') || '').replace(/\D/g, '').slice(0, 9);
  const town = [city, state].filter(Boolean).join(', ');
  const long = [name, street, town].filter(Boolean).join(', ');
  const short = [name, town].filter(Boolean).join(', ');
  const site = (long.length <= SITE_MAX ? long : short).slice(0, SITE_MAX);
  return { name, street, city, state, ein, site };
}

/** Drop the partner params from the address bar once they're in the draft. */
export function clearPartnerParams() {
  try {
    const url = new URL(window.location.href);
    if (!PARAMS.some((k) => url.searchParams.has(k))) return;
    PARAMS.forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* history unavailable; the params are harmless */
  }
}
