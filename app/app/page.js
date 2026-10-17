import AppFrame from '../../components/AppFrame.jsx';
import Home from '../../components/screens/Home.jsx';

export const metadata = {
  title: 'Home, VolunteerU',
};

export default function Page() {
  return (
    <AppFrame>
      <Home />
    </AppFrame>
  );
}
