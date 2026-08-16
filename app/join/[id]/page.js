import JoinListing from '../../../components/screens/JoinListing.jsx';

export default async function Page({ params }) {
  const { id } = await params;
  return <JoinListing id={id} />;
}
