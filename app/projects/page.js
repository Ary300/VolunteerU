import ProjectsRedirect from '../../components/ProjectsRedirect.jsx';

export const metadata = {
  title: 'Student projects, VolunteerU',
};

// The bare path has no page of its own: Lead when signed in, the student
// projects on Discover when signed out (see ProjectsRedirect).
export default function Page() {
  return <ProjectsRedirect />;
}
