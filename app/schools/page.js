import { Suspense } from 'react';
import { Schools } from '../../components/screens/PublicPages.jsx';

export const metadata = {
  title: 'For schools, VolunteerU',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Schools />
    </Suspense>
  );
}
