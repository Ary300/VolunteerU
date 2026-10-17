import { PlainFrame } from '../../components/AppFrame.jsx';
import Auth from '../../components/screens/Auth.jsx';

export const metadata = {
  title: 'Reset your password, VolunteerU',
};

export default function Page() {
  return (
    <PlainFrame>
      <Auth mode="forgot" />
    </PlainFrame>
  );
}
