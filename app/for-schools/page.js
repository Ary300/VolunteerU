import { permanentRedirect } from 'next/navigation';

// The schools page lives at /schools; the longer path people guess goes there.
export default function Page() {
  permanentRedirect('/schools');
}
