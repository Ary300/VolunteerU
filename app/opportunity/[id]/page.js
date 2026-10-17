import { redirect } from 'next/navigation';

// Live listings use UUID ids and open on their shared page at /join/<id>.
// Any other id is a link from the old built-in catalogue, which no longer
// exists. It goes to the public "out of date" page so nobody is asked to
// sign in just to learn that.
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }) {
  const { id } = await params;
  const raw = String(id || '');
  if (UUID_RX.test(raw)) redirect(`/join/${raw}`);
  redirect(`/join/${encodeURIComponent(raw || 'old')}?old=1`);
}
