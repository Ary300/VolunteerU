import { redirect } from 'next/navigation';

// The bare path has no page of its own; student projects are run from Lead.
export default function Page() {
  redirect('/lead');
}
