import AppFrame from '../../../components/AppFrame.jsx';
import Settings from '../../../components/screens/Settings.jsx';

// Tab titles for each section (labels match SECTIONS in Settings.jsx).
const TITLES = {
  account: 'Account',
  preferences: 'Interests',
  notifications: 'Notifications',
  privacy: 'Privacy',
  appearance: 'Appearance',
  permissions: 'Permissions',
  data: 'Your data',
  help: 'Help and safety',
  about: 'About',
};

export async function generateMetadata({ params }) {
  const { section } = await params;
  const label = TITLES[(section && section[0]) || 'account'];
  return { title: label ? `${label}, Settings, VolunteerU` : 'Settings, VolunteerU' };
}

export default async function Page({ params }) {
  const { section } = await params;
  return (
    <AppFrame>
      <Settings section={(section && section[0]) || 'account'} />
    </AppFrame>
  );
}
