import AppFrame from '../../components/AppFrame.jsx';
import Lead from '../../components/screens/Lead.jsx';

// Lead swaps in "<Project> · <Tab>, VolunteerU" once the workspace loads.
export const metadata = {
  title: 'Lead a project, VolunteerU',
};

export default function Page() {
  return (
    <AppFrame>
      <Lead tab="overview" />
    </AppFrame>
  );
}
