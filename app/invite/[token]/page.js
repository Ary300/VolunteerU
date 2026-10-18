import { PlainFrame } from '../../../components/AppFrame.jsx';
import InviteJoin from '../../../components/screens/InviteJoin.jsx';

/* /invite/<token>, the link a lead sends a student they added to a roster.
   The token is a secret, so the page stays out of search results and never
   sends it on as a referrer. */
export const metadata = {
  title: 'Join your team, VolunteerU',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function Page({ params }) {
  const { token } = await params;
  return (
    <PlainFrame>
      <InviteJoin token={String(token || '').toLowerCase()} />
    </PlainFrame>
  );
}
