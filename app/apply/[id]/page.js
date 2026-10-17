import { redirect } from 'next/navigation';
import AppFrame from '../../../components/AppFrame.jsx';
import Apply from '../../../components/screens/Apply.jsx';

// Live listings use UUID ids; their apply flow lives on /join/<id>.
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }) {
  const { id } = await params;
  if (UUID_RX.test(String(id || ''))) redirect(`/join/${id}`);
  return (
    <AppFrame>
      <Apply id={id} />
    </AppFrame>
  );
}
