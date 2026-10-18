import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import AppFrame from '../../../components/AppFrame.jsx';
import Nonprofit from '../../../components/screens/Nonprofit.jsx';
import { cleanEin, fetchOrganization, causeFromNtee } from '../../../lib/propublica.js';

/* /nonprofits/<ein>, a registered nonprofit's page, public and shareable.
   The server reads the IRS record once (cached for a day) so the link
   unfurls with the organization's name and town, and the page arrives with
   its facts already in hand. A malformed or unknown EIN is a 404 with this
   segment's not-found page. If ProPublica is down the page still opens and
   loads the record in the browser, with a retry. */

const DESCRIPTION_MAX = 200;

const readOrg = cache(async (ein) => fetchOrganization(ein));

function titleCase(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Of|The|And|For|In|At|To)\b/g, (w, _m, i) => (i === 0 ? w : w.toLowerCase()));
}

function describe(o) {
  const cause = String(o.cause || causeFromNtee(o.nteeCode) || '').replace(/\s*&\s*/g, ' and ');
  const what = cause && cause !== 'Nonprofit' ? `${cause} nonprofit` : 'Nonprofit';
  const where = [titleCase(o.city), o.state].filter(Boolean).join(', ');
  const parts = [`${what}${where ? ` in ${where}` : ''}`];
  if (o.rulingYear) parts.push(`tax-exempt since ${o.rulingYear}`);
  return `${parts.join(', ')}. Open shifts, directions and IRS facts on VolunteerU.`.slice(0, DESCRIPTION_MAX);
}

export async function generateMetadata({ params }) {
  const { ein: raw } = await params;
  const ein = cleanEin(raw);
  if (!ein) return { title: 'Nonprofit not found · VolunteerU', robots: { index: false } };
  const r = await readOrg(ein);
  if (r.status === 'not_found') return { title: 'Nonprofit not found · VolunteerU', robots: { index: false } };
  if (r.status !== 'ok') return { title: 'Nonprofit · VolunteerU' };
  const o = r.organization;
  const name = titleCase(o.name);
  const description = describe(o);
  const path = `/nonprofits/${o.ein}`;
  return {
    title: `${name} · VolunteerU`,
    description,
    alternates: { canonical: path },
    openGraph: { title: name, description, type: 'website', url: path, siteName: 'VolunteerU' },
    twitter: { card: 'summary', title: name, description },
  };
}

export default async function Page({ params }) {
  const { ein: raw } = await params;
  const ein = cleanEin(raw);
  if (!ein) notFound();
  // A dashed or spaced EIN moves to the canonical digits URL.
  if (String(raw) !== ein) redirect(`/nonprofits/${ein}`);
  const r = await readOrg(ein);
  if (r.status === 'not_found') notFound();
  return (
    <AppFrame>
      <Nonprofit ein={ein} initial={r.status === 'ok' ? r.organization : null} />
    </AppFrame>
  );
}
