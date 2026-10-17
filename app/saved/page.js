import AppFrame from '../../components/AppFrame.jsx';
import { Saved } from '../../components/screens/Misc.jsx';

export const metadata = {
  title: 'Saved, VolunteerU',
};

export default function Page() {
  return (
    <AppFrame>
      <Saved />
    </AppFrame>
  );
}
