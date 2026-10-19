/* ==========================================================================
   nonprofitLinks.js, how to reach a nonprofit: its website, phone and the
   page on that website where volunteers sign up. Server only.

   Sources, in order, all public and keyless:
   1. The organization's latest IRS e-filed return. Form 990 and 990-EZ
      carry the website (WebsiteAddressTxt) and every return header carries
      the filer's phone (Filer/PhoneNum). ProPublica serves each e-filed
      return rendered from the IRS XML, with every value tagged by its XML
      path, at /nonprofits/full_text/<object id>/<form>.
   2. Wikidata's official website (P856) for the item with this EIN, when
      the return has no website or the one it lists no longer loads.
   3. The website's own homepage, read once, for a link whose text or
      address says volunteer or get involved. When the homepage has none,
      /volunteer is tried, and kept only when it is a real volunteer page.

   The homepage fetch only goes to public hosts: http(s) on the default
   ports, every DNS answer checked against private, loopback, link-local
   and reserved ranges before connecting (the checked address is the one
   used, so a second lookup can't swap it), at most 5 redirects, a 3 second
   budget and 500KB of HTML.

   Nothing is guessed. A value no source has is left empty, and the page
   says so instead of inventing one.
   ========================================================================== */

import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { wikidataWebsite } from './propublica.js';

const UA = 'VolunteerU/1.0 (https://www.volunteeruapp.com)';
const FILING_BASE = 'https://projects.propublica.org/nonprofits/full_text';
const FILING_TIMEOUT_MS = 6000;
const PAGE_TIMEOUT_MS = 3000;
const PAGE_MAX_BYTES = 500 * 1024;
const MAX_REDIRECTS = 5;
const CACHE_MS = 24 * 3600 * 1000;
const MISS_CACHE_MS = 3 * 3600 * 1000;
const CACHE_MAX = 800;

/* ---- values ------------------------------------------------------------- */

const JUNK_SITE = /^(n\/?a|none|no|null|nil|0|-+|\.+|not applicable|no website|unknown|tbd|na\.?)$/i;

/**
 * "www.INDYOPERA.org" -> "https://www.indyopera.org". Returns '' for
 * placeholders ("N/A", "NONE"), e-mail addresses and anything that isn't a
 * plain http(s) address with a dotted host on the default port.
 */
export function normalizeWebsite(raw) {
  let s = String(raw == null ? '' : raw).trim().replace(/^[<("']+|[>)"',;.]+$/g, '').trim();
  if (!s || JUNK_SITE.test(s) || /\s/.test(s) || s.includes('@') && !/^https?:\/\//i.test(s)) return '';
  if (/^\/\//.test(s)) s = `https:${s}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    return '';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  if (u.username || u.password || u.port) return '';
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /\.$/.test(host) || net.isIP(host)) return '';
  if (!/[a-z]{2,}$/.test(host)) return '';
  u.hostname = host;
  u.hash = '';
  return u.toString();
}

/**
 * A US phone from a filing: "3172833531" -> { display: "(317) 283-3531",
 * tel: "+13172833531" }, or null when it isn't a dialable 10-digit number.
 */
export function normalizePhone(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10) return null;
  if (/^[01]/.test(d) || /^\d{3}[01]/.test(d)) return null; // area code and exchange can't start with 0 or 1
  if (/^(\d)\1{9}$/.test(d) || /^\d{3}555(01\d\d)$/.test(d)) return null;
  return { display: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`, tel: `+1${d}` };
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, n) => {
      const c = Number(n);
      return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : ' ';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => {
      const c = parseInt(n, 16);
      return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : ' ';
    });
}

/* ---- the IRS e-filed return ------------------------------------------- */

const FORMS_BY_HINT = { 0: 'IRS990', 1: 'IRS990EZ', 2: 'IRS990PF' };
const ALL_FORMS = ['IRS990', 'IRS990EZ', 'IRS990PF'];

function tagged(html, pathTail) {
  const rx = new RegExp(`id="[^"]*/${pathTail}"[^>]*>([^<]*)<`, 'i');
  const m = rx.exec(html);
  return m ? decodeEntities(m[1]).trim() : '';
}

/** The website and phone on one rendered return. */
export function contactFromFiling(html) {
  const website = normalizeWebsite(tagged(html, 'WebsiteAddressTxt\\[1\\]'));
  const phone = normalizePhone(tagged(html, 'Filer\\[1\\]/PhoneNum\\[1\\]'));
  return { website, phone };
}

/**
 * The latest e-filed return's website and phone.
 * @param {string} objectId  the IRS e-file object id (ProPublica's latest_object_id)
 * @param {number|null} formHint  0 990, 1 990-EZ, 2 990-PF, from the latest filing
 * @returns {Promise<{ website: string, phone: object|null, found: boolean }>}
 */
export async function filingContact(objectId, formHint) {
  const id = String(objectId || '');
  if (!/^\d{12,20}$/.test(id)) return { website: '', phone: null, found: false };
  const first = FORMS_BY_HINT[formHint];
  const forms = first ? [first, ...ALL_FORMS.filter((f) => f !== first)] : ALL_FORMS;
  for (const form of forms) {
    let res;
    try {
      res = await fetch(`${FILING_BASE}/${id}/${form}`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        cache: 'no-store',
        redirect: 'follow',
        signal: AbortSignal.timeout(FILING_TIMEOUT_MS),
      });
    } catch (err) {
      console.warn('[nonprofitLinks] filing fetch failed', id, form, err && err.name);
      return { website: '', phone: null, found: false };
    }
    if (res.status === 404) continue;
    if (!res.ok) {
      console.warn('[nonprofitLinks] filing status', id, form, res.status);
      return { website: '', phone: null, found: false };
    }
    const html = await res.text().catch(() => '');
    if (!html) return { website: '', phone: null, found: false };
    return { ...contactFromFiling(html), found: true };
  }
  return { website: '', phone: null, found: false };
}

/* ---- safe page fetch -------------------------------------------------- */

function v4Private(ip) {
  const [a, b, c] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/** True for any address a public website can't have. */
export function isPrivateAddress(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) return v4Private(ip);
  if (kind !== 6) return true;
  const s = ip.toLowerCase();
  const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s) || /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return v4Private(mapped[1]);
  if (s === '::' || s === '::1') return true;
  if (/^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s)) return true; // unique local, link-local, multicast
  if (/^2001:0?db8:/.test(s) || /^::ffff:/.test(s) || /^::/.test(s)) return true;
  return false;
}

/* A DNS lookup that refuses the whole host when any answer is private. */
function safeLookup(hostname, options, cb) {
  const opts = typeof options === 'object' && options ? options : {};
  dns.lookup(hostname, { all: true, family: opts.family || 0 }, (err, addrs) => {
    if (err) return cb(err);
    const list = Array.isArray(addrs) ? addrs : [];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      const e = new Error(`blocked address for ${hostname}`);
      e.code = 'EBLOCKED';
      return cb(e);
    }
    if (opts.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

function decoderFor(encoding) {
  const e = String(encoding || '').toLowerCase().trim();
  if (e === 'gzip' || e === 'x-gzip') return zlib.createGunzip();
  if (e === 'deflate') return zlib.createInflate();
  if (e === 'br') return zlib.createBrotliDecompress();
  return null;
}

function requestOnce(url, deadline) {
  return new Promise((resolve) => {
    const left = deadline - Date.now();
    if (left <= 0) return resolve({ error: 'timeout' });
    const mod = url.protocol === 'https:' ? https : http;
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const req = mod.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.8',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return done({ status, location: String(res.headers.location) });
        }
        const type = String(res.headers['content-type'] || '');
        if (status >= 400 || (type && !/html|xml/i.test(type))) {
          res.resume();
          return done({ status, html: '' });
        }
        const dec = decoderFor(res.headers['content-encoding']);
        const stream = dec ? res.pipe(dec) : res;
        const chunks = [];
        let size = 0;
        const finish = () => done({ status, html: Buffer.concat(chunks).toString('utf8') });
        stream.on('data', (chunk) => {
          size += chunk.length;
          chunks.push(chunk);
          if (size >= PAGE_MAX_BYTES) {
            finish();
            req.destroy();
          }
        });
        stream.on('end', finish);
        stream.on('error', () => (chunks.length ? finish() : done({ error: 'decode' })));
      }
    );
    const timer = setTimeout(() => {
      req.destroy();
      done({ error: 'timeout' });
    }, left);
    req.on('error', (err) => done({ error: (err && err.code) || 'request' }));
    req.end();
  });
}

function allowedUrl(raw, base) {
  let u;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || u.port) return null;
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, ''))) return null;
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(u.hostname)) return null;
  return u;
}

/**
 * GET one public web page. Resolves { ok, status, url, html } where `url` is
 * the address after redirects; `error` is set when it never loaded.
 */
export async function fetchPublicPage(raw, { timeoutMs = PAGE_TIMEOUT_MS } = {}) {
  let url = allowedUrl(raw);
  if (!url) return { ok: false, error: 'bad_url', status: 0, url: '', html: '' };
  const deadline = Date.now() + timeoutMs;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const r = await requestOnce(url, deadline);
    if (r.error) return { ok: false, error: r.error, status: 0, url: url.toString(), html: '' };
    if (r.location) {
      const next = allowedUrl(r.location, url);
      if (!next) return { ok: false, error: 'bad_redirect', status: r.status, url: url.toString(), html: '' };
      url = next;
      continue;
    }
    return { ok: r.status >= 200 && r.status < 300, status: r.status, url: url.toString(), html: r.html || '' };
  }
  return { ok: false, error: 'too_many_redirects', status: 0, url: url.toString(), html: '' };
}

/* ---- the volunteer link ------------------------------------------------ */

const SOCIAL = /(^|\.)(facebook|instagram|twitter|x|linkedin|youtube|tiktok|pinterest|threads|flickr|vimeo)\.com$/i;
/* Sign-up services nonprofits use; a link to one is the actual form. */
const SIGNUP = /(^|\.)(volunteerhub\.com|signupgenius\.com|volunteermatters\.(com|org)|galaxydigital\.com|givepulse\.com|volunteermatch\.org|bettertogether\.com|volunteerlocal\.com|golden\.(com|volunteer)|samaritan\.com|bloomerang\.co|bloomerang\.com|forms\.gle|docs\.google\.com|jotform\.com|wufoo\.com|typeform\.com|cognitoforms\.com|smartsheet\.com|givegab\.com|volgistics\.com|mobilize\.us|idealist\.org|track-it-forward\.com|helperhelper\.com|timecounts\.org|vomo\.org)$/i;
/* A parked or for-sale domain: the website on file is gone. */
const PARKED = /(^|\.)(hugedomains\.com|godaddy\.com|sedo\.com|dan\.com|afternic\.com|parkingcrew\.net|bodis\.com|sedoparking\.com|domainmarket\.com|undeveloped\.com|buydomains\.com)$/i;

/* A homepage that is now spam: an expired domain bought by a gambling,
   adult or pill site, or a hacked one. Checked against the page's title,
   description and first heading. */
const SPAM = /\b(slot\s*gacor|gacor|slot\s*online|judi|togel|bandar|situs|casino|sportsbook|betting|taruhan|poker\s*online|baccarat|porn\w*|xxx|escort|viagra|cialis|replica\s+watch\w*|payday\s+loans?)\b/i;

/* Words in a nonprofit's name that don't identify it. */
const NAME_FILLER = new Set(['inc', 'incorporated', 'corp', 'corporation', 'co', 'ltd', 'llc', 'nfp', 'the', 'of', 'and', 'for', 'a', 'an', 'in', 'at', 'to', 'on', 'foundation', 'fund', 'association', 'assn', 'society', 'club', 'center', 'centre', 'council', 'committee', 'organization', 'trust', 'group', 'chapter', 'friends', 'community', 'communities', 'services', 'service', 'church', 'ministries', 'ministry', 'international', 'national', 'american', 'america', 'united', 'states', 'us', 'usa', 'post', 'no', 'number', 'local', 'indiana', 'indianapolis', 'indy', 'county', 'city', 'town']);

/** "Aaf Indianapolis Inc" -> ['aaf']: the words that identify the org. */
export function nameTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !NAME_FILLER.has(w));
}

/**
 * The registrable part of a host: "www.indyopera.org" -> "indyopera.org",
 * "carmel.k12.in.us" -> "carmel.k12.in.us", "bbc.co.uk" -> "bbc.co.uk".
 */
export function siteKey(host) {
  const labels = String(host || '').toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const n = labels.length;
  const tld = labels[n - 1];
  const sld = labels[n - 2];
  let keep = 2;
  if (tld === 'us' && labels[n - 3] === 'k12') keep = 4;
  else if (tld === 'us' && sld.length === 2) keep = 3;
  else if (tld.length === 2 && /^(co|com|org|net|ac|gov|edu)$/.test(sld)) keep = 3;
  return labels.slice(-Math.min(keep, n)).join('.');
}

function textOf(fragment) {
  return decodeEntities(String(fragment || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** The page's title, description, site name and first heading, as one line. */
export function pageHead(html) {
  const h = String(html || '');
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h) || [])[1] || '';
  const h1 = (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h) || [])[1] || '';
  const metas = [];
  const rx = /<meta\b[^>]*>/gi;
  let m;
  let n = 0;
  while ((m = rx.exec(h)) && n < 200) {
    n += 1;
    const tag = m[0];
    if (!/\b(name|property)\s*=\s*["']?(description|og:title|og:site_name|og:description)["'\s>]/i.test(tag)) continue;
    const c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (c) metas.push(c[1] ?? c[2] ?? '');
  }
  return textOf([title, h1, ...metas].join(' '));
}

/** True when a homepage is now a gambling, adult or pill site. */
export function looksLikeSpam(html) {
  return SPAM.test(pageHead(html));
}

/**
 * After a redirect to another domain, the new page counts as theirs only
 * when its address or its title, description or heading names them.
 */
export function namesOrg(html, url, name) {
  const tokens = nameTokens(name);
  if (!tokens.length) return false;
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = '';
  }
  const head = pageHead(html).toLowerCase();
  return tokens.some((t) => host.includes(t) || new RegExp(`\\b${t}\\b`).test(head));
}

function anchors(html) {
  const out = [];
  const rx = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let m;
  let n = 0;
  while ((m = rx.exec(html)) && n < 3000) {
    n += 1;
    const attrs = m[1];
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    if (!href) continue;
    const label = /\b(?:aria-label|title)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const text = decodeEntities(m[2].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    out.push({
      href: decodeEntities(href[1] ?? href[2] ?? href[3] ?? '').trim(),
      text: text || (label ? decodeEntities(label[1] ?? label[2] ?? '').trim() : ''),
    });
  }
  return out;
}

function scoreLink(text, u, site) {
  const t = text.toLowerCase();
  const path = decodeURIComponent(`${u.pathname}${u.search}`).toLowerCase();
  const sameSite = site && (u.hostname === site || u.hostname.endsWith(`.${site}`) || site.endsWith(`.${u.hostname}`));
  const signup = SIGNUP.test(u.hostname);
  if (!sameSite && !signup && SOCIAL.test(u.hostname)) return 0;
  if (/\b(log ?in|sign ?in|donat|give now|store|shop|jobs?|careers?|employment|news|blog|story|stories)\b/.test(t) && !/volunteer/.test(t)) return 0;
  // Roles for members, board seats and committees aren't something a student signs up for.
  const membersOnly = /\b(leaders?|leadership|board|committees?|members?|membership|pro ?bono|attorneys?|lawyers?|staff|employees?|corporate)\b|leadership|committee|pro-?bono|board-?(service|member)/;
  if (membersOnly.test(t) || membersOnly.test(path)) return 0;
  let score = 0;
  if (/^(volunteer|volunteers|volunteering)( (with us|now|today|here|opportunities|opportunity|options|info|information|sign ?up|signup|form))?!?$/.test(t)) score = 100;
  else if (/volunteer/.test(t) && t.length <= 60) score = 85;
  else if (/volunteer/.test(path)) score = 70;
  else if (/^(get involved|getting involved|ways to (help|get involved)|how (to|you can) help|take action|serve with us|join us)$/.test(t)) score = 45;
  else if (/get-?involved|getinvolved|get_involved|ways-to-help|how-to-help/.test(path)) score = 40;
  if (!score) return 0;
  if (signup) score += 10;
  else if (!sameSite) score -= 25;
  if (/volunteer/.test(t) && /volunteer/.test(path)) score += 5;
  if (/\.(pdf|docx?|jpe?g|png)$/i.test(u.pathname)) score -= 20;
  return score;
}

/**
 * The best volunteer link on a page, as an absolute http(s) URL, or ''.
 * @param {string} html
 * @param {string} baseUrl  the page's own address, for relative links
 */
export function findVolunteerLink(html, baseUrl) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return '';
  }
  const site = base.hostname.replace(/^www\./, '');
  let best = { score: 0, url: '' };
  for (const a of anchors(String(html || ''))) {
    if (!a.href || /^(mailto:|tel:|javascript:|#)/i.test(a.href)) continue;
    const u = allowedUrl(a.href, base);
    if (!u) continue;
    u.hash = '';
    if (u.toString() === base.toString()) continue;
    const s = scoreLink(a.text, u, site);
    if (s > best.score) best = { score: s, url: u.toString() };
  }
  return best.score >= 40 ? best.url : '';
}

/* A /volunteer page counts only when it loads and says volunteer in its title or heading. */
async function probeVolunteerPath(homeUrl) {
  let u;
  try {
    u = new URL('/volunteer', homeUrl);
  } catch {
    return '';
  }
  const r = await fetchPublicPage(u.toString(), { timeoutMs: PAGE_TIMEOUT_MS });
  if (!r.ok || !r.html) return '';
  if (!/volunteer/i.test(new URL(r.url).pathname)) return '';
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(r.html) || [])[1] || '';
  const h1 = (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(r.html) || [])[1] || '';
  const head = decodeEntities(`${title} ${h1}`.replace(/<[^>]*>/g, ' '));
  if (!/volunteer/i.test(head) || /not found|404|page can.?t be found|doesn.?t exist/i.test(head)) return '';
  return r.url;
}

/**
 * Loads a website's homepage. Resolves { live, url, volunteerUrl }: `live`
 * is false when the address doesn't answer at all or now lands on a parked
 * domain, so the caller can drop it.
 */
export async function readHomepage(site, name = '') {
  let r = await fetchPublicPage(site);
  // Some small-org sites only answer on plain http.
  if (r.error && /^https:/.test(site) && r.error !== 'EBLOCKED' && r.error !== 'ENOTFOUND') {
    const plain = await fetchPublicPage(site.replace(/^https:/, 'http:'));
    if (!plain.error) r = plain;
  }
  if (r.error === 'ENOTFOUND' || r.error === 'EBLOCKED' || r.error === 'bad_url' || r.error === 'bad_redirect') return { live: false, url: '', volunteerUrl: '' };
  const hostOf = (u) => {
    try {
      return new URL(u).hostname;
    } catch {
      return '';
    }
  };
  const host = hostOf(r.url);
  const fromHost = hostOf(site);
  // A redirect to some other domain is often an expired name someone else
  // bought. It's kept only when the page it lands on names the organization.
  const moved = Boolean(host) && siteKey(host) !== siteKey(fromHost);
  // A redirect chain that never settles, or one that left their domain and
  // then stalled, isn't their site.
  if (r.error === 'too_many_redirects' || (r.error && moved)) return { live: false, url: '', volunteerUrl: '' };
  if (r.error) return { live: true, url: site, volunteerUrl: '' }; // slow or refused; the site may still work for a person
  if (PARKED.test(host)) return { live: false, url: '', volunteerUrl: '' };
  const url = r.url || site;
  if (moved && (!r.ok || !namesOrg(r.html, url, name))) return { live: false, url: '', volunteerUrl: '' };
  if (r.ok && looksLikeSpam(r.html)) return { live: false, url: '', volunteerUrl: '' };
  if (!r.ok) return { live: r.status !== 404 && r.status !== 410, url, volunteerUrl: '' };
  const volunteerUrl = findVolunteerLink(r.html, url) || (await probeVolunteerPath(url));
  return { live: true, url, volunteerUrl };
}

/* ---- the whole answer, cached ----------------------------------------- */

const cache = new Map(); // ein -> { at, ttl, v }
const inflight = new Map(); // ein -> Promise

function remember(ein, v) {
  cache.delete(ein);
  const empty = !v.website && !v.phone;
  cache.set(ein, { at: Date.now(), ttl: empty ? MISS_CACHE_MS : CACHE_MS, v });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/** The cached answer for an EIN, or null when it hasn't been looked up lately. */
export function peekLinks(ein) {
  const hit = cache.get(String(ein));
  if (!hit || Date.now() - hit.at > hit.ttl) return null;
  return hit.v;
}

async function resolve(org) {
  const filing = await filingContact(org.efileId, org.efileForm);
  const phone = filing.phone;
  const candidates = [];
  if (filing.website) candidates.push({ site: filing.website, source: 'irs990' });
  const wiki = normalizeWebsite(org.website || '') || normalizeWebsite(await wikidataWebsite(org.ein));
  if (wiki && !candidates.some((c) => sameHost(c.site, wiki))) candidates.push({ site: wiki, source: 'wikidata' });

  for (const c of candidates) {
    const home = await readHomepage(c.site, org.name);
    if (!home.live) continue;
    return {
      website: home.url || c.site,
      volunteerUrl: home.volunteerUrl || '',
      phone: phone ? phone.display : '',
      phoneTel: phone ? phone.tel : '',
      linkSource: c.source,
      phoneSource: phone ? 'irs990' : '',
      filingRead: filing.found,
    };
  }
  return {
    website: '',
    volunteerUrl: '',
    phone: phone ? phone.display : '',
    phoneTel: phone ? phone.tel : '',
    linkSource: '',
    phoneSource: phone ? 'irs990' : '',
    filingRead: filing.found,
  };
}

function sameHost(a, b) {
  try {
    return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
}

/**
 * How to reach one nonprofit.
 * @param {{ ein: number|string, efileId?: string, efileForm?: number|null, website?: string }} org
 *   the record from lib/propublica.js detailFrom (website there is Wikidata's, if any)
 * @returns {Promise<{ website: string, volunteerUrl: string, phone: string, phoneTel: string,
 *   linkSource: 'irs990'|'wikidata'|'', phoneSource: 'irs990'|'', filingRead: boolean }>}
 *   Never throws; a failed source just leaves its fields empty.
 */
export function nonprofitLinks(org) {
  const ein = String((org && org.ein) || '');
  const hit = peekLinks(ein);
  if (hit) return Promise.resolve(hit);
  if (inflight.has(ein)) return inflight.get(ein);
  const p = resolve(org)
    .catch((err) => {
      console.error('[nonprofitLinks] lookup failed', ein, err);
      return { website: '', volunteerUrl: '', phone: '', phoneTel: '', linkSource: '', phoneSource: '', filingRead: false };
    })
    .then((v) => {
      remember(ein, v);
      inflight.delete(ein);
      return v;
    });
  inflight.set(ein, p);
  return p;
}
