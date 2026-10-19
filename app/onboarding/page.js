import { PlainFrame } from '../../components/AppFrame.jsx';
import Onboarding from '../../components/screens/Onboarding.jsx';

export const metadata = {
  title: 'Get started, VolunteerU',
};

export default function Page() {
  return (
    <PlainFrame>
      <Onboarding />
    </PlainFrame>
  );
}
