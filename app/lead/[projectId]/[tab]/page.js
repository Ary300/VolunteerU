import AppFrame from '../../../../components/AppFrame.jsx';
import Lead from '../../../../components/screens/Lead.jsx';

export default async function Page({ params }) {
  const { projectId, tab } = await params;
  return (
    <AppFrame>
      <Lead projectId={projectId} tab={tab} />
    </AppFrame>
  );
}
