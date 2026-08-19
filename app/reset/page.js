import { PlainFrame } from '../../components/AppFrame.jsx';
import Auth from '../../components/screens/Auth.jsx';

export default function Page() {
  return (
    <PlainFrame>
      <Auth mode="reset" />
    </PlainFrame>
  );
}
