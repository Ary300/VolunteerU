import AppFrame from '../../../components/AppFrame.jsx';
import Settings from '../../../components/screens/Settings.jsx';

export default async function Page({ params }) {
  const { section } = await params;
  return (
    <AppFrame>
      <Settings section={(section && section[0]) || 'account'} />
    </AppFrame>
  );
}
