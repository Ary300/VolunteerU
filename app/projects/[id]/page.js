import AppFrame from '../../../components/AppFrame.jsx';
import { PeerProject } from '../../../components/screens/Misc.jsx';

export default async function Page({ params }) {
  const { id } = await params;
  return (
    <AppFrame>
      <PeerProject id={id} />
    </AppFrame>
  );
}
