import { PlainFrame } from '../../components/AppFrame.jsx';
import Auth from '../../components/screens/Auth.jsx';

export const metadata = {
  title: 'Create your account, VolunteerU',
};

export default function Page() {
  return (
    <PlainFrame>
      <Auth mode="signup" />
    </PlainFrame>
  );
}
