import AppFrame from '../../components/AppFrame.jsx';
import { Notifications } from '../../components/screens/Misc.jsx';

export const metadata = {
  title: 'Notifications, VolunteerU',
};

export default function Page() {
  return (
    <AppFrame>
      <Notifications />
    </AppFrame>
  );
}
