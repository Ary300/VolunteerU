import AppFrame from '../../../components/AppFrame.jsx';
import Detail from '../../../components/screens/Detail.jsx';

export default async function Page({ params }) {
  const { id } = await params;
  return (
    <AppFrame>
      <Detail id={id} />
    </AppFrame>
  );
}
