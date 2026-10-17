import { redirect } from 'next/navigation';
import AppFrame from '../../../components/AppFrame.jsx';
import { PeerProject } from '../../../components/screens/Misc.jsx';

// Published student projects use UUID ids and open on /join/<id>.
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }) {
  const { id } = await params;
  if (UUID_RX.test(String(id || ''))) redirect(`/join/${id}`);
  return (
    <AppFrame>
      <PeerProject id={id} />
    </AppFrame>
  );
}
