import AppFrame from '../../components/AppFrame.jsx';
import Discover from '../../components/screens/Discover.jsx';

export const metadata = {
  title: 'Discover, VolunteerU',
};

export default function Page() {
  return (
    <AppFrame>
      <Discover />
    </AppFrame>
  );
}
