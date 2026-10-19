import { permanentRedirect } from 'next/navigation';

// "How it works" is a section of the landing page. A typed or shared
// /how-it-works lands there instead of on a 404.
export default function Page() {
  permanentRedirect('/#how-it-works');
}
