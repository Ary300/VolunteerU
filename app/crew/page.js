import AppFrame from '../../components/AppFrame.jsx';
import Crew from '../../components/screens/Crew.jsx';

export const metadata = {
  title: 'My crew, VolunteerU',
};

export default function Page() {
  return (
    <AppFrame>
      <Crew />
    </AppFrame>
  );
}
