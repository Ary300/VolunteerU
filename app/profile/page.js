import AppFrame from '../../components/AppFrame.jsx';
import Profile from '../../components/screens/Profile.jsx';

export const metadata = {
  title: 'Profile, VolunteerU',
};

export default function Page() {
  return (
    <AppFrame>
      <Profile />
    </AppFrame>
  );
}
