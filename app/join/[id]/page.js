import JoinListing from '../../../components/screens/JoinListing.jsx';

export default async function Page({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) || {};
  // ?old=1 marks a redirect from a retired /opportunity, /apply or /projects link.
  return <JoinListing id={id} outdated={sp.old === '1'} />;
}
