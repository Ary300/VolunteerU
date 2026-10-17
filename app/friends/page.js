import AppFrame from '../../components/AppFrame.jsx';
import { Friends } from '../../components/screens/Misc.jsx';

export const metadata = {
  title: 'Friends going, VolunteerU',
};

export default function Page() {
  return (
    <AppFrame>
      <Friends />
    </AppFrame>
  );
}
