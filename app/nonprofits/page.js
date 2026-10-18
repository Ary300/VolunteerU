import { redirect } from 'next/navigation';

// The index of every /nonprofits/<ein> page is Discover's nonprofit list.
export default function Page() {
  redirect('/discover?view=nonprofits');
}
