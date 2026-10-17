import { PlainFrame } from '../../components/AppFrame.jsx';
import { Schools } from '../../components/screens/PublicPages.jsx';

export const metadata = {
  title: 'For schools, VolunteerU',
};

export default function Page() {
  return (
    <PlainFrame>
      <Schools />
    </PlainFrame>
  );
}
