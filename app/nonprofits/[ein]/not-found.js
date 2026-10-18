import AppFrame from '../../../components/AppFrame.jsx';
import { NonprofitMissing } from '../../../components/screens/Nonprofit.jsx';

export const metadata = {
  title: 'Nonprofit not found · VolunteerU',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <AppFrame>
      <NonprofitMissing />
    </AppFrame>
  );
}
