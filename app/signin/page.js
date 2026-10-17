import { PlainFrame } from '../../components/AppFrame.jsx';
import Auth from '../../components/screens/Auth.jsx';

export const metadata = {
  title: 'Sign in, VolunteerU',
};

export default function Page() {
  return (
    <PlainFrame>
      <Auth mode="signin" />
    </PlainFrame>
  );
}
