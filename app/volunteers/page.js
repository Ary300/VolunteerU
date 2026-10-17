import AppFrame from '../../components/AppFrame.jsx';
import Volunteers from '../../components/screens/Volunteers.jsx';

export const metadata = {
  title: 'Find volunteers, VolunteerU',
};

export default function Page() {
  return (
    <AppFrame>
      <Volunteers />
    </AppFrame>
  );
}
