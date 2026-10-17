import { redirect } from 'next/navigation';

// Published student projects use UUID ids and open on /join/<id>. Any other
// id comes from the old built-in project list and gets the public "out of
// date" page, with no sign-in step.
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }) {
  const { id } = await params;
  const raw = String(id || '');
  if (UUID_RX.test(raw)) redirect(`/join/${raw}`);
  redirect(`/join/${encodeURIComponent(raw || 'old')}?old=1`);
}
