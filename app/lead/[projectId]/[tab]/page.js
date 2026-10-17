import AppFrame from '../../../../components/AppFrame.jsx';
import Lead from '../../../../components/screens/Lead.jsx';

// The project lives in the signed-in user's client store, so this is only the
// title before it loads. Lead then names the tab "<Project> · <Tab>, VolunteerU".
export const metadata = {
  title: 'Project workspace, VolunteerU',
};

export default async function Page({ params }) {
  const { projectId, tab } = await params;
  return (
    <AppFrame>
      <Lead projectId={projectId} tab={tab} />
    </AppFrame>
  );
}
