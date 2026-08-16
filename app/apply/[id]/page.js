import AppFrame from '../../../components/AppFrame.jsx';
import Apply from '../../../components/screens/Apply.jsx';

export default async function Page({ params }) {
  const { id } = await params;
  return (
    <AppFrame>
      <Apply id={id} />
    </AppFrame>
  );
}
