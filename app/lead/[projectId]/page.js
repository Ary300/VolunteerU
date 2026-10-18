import { redirect } from 'next/navigation';

// A bare project URL opens the project's overview tab.
export default async function Page({ params }) {
  const { projectId } = await params;
  redirect(`/lead/${encodeURIComponent(String(projectId || ''))}/overview`);
}
