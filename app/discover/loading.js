import { DiscoverSkeleton } from '../../components/RouteSkeletons.jsx';

/* Shown while this route's page is on its way: the same layout in still
   mist blocks, so nothing moves when the page lands. */
export default function Loading() {
  return <DiscoverSkeleton />;
}
