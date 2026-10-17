import './globals.css';
import Providers from '../components/Providers.jsx';

export const metadata = {
  metadataBase: new URL('https://www.volunteeruapp.com'),
  title: 'VolunteerU, volunteer opportunities and nonprofits near you',
  description:
    'Search volunteer opportunities and nonprofits near you, sign up for shifts, and log your hours. Organizers confirm them in the app.',
  applicationName: 'VolunteerU',
  // Favicon + Apple touch icon come from app/icon.png and app/apple-icon.png
  // (Next.js file conventions), so the browser tab / home-screen icon is the
  // VolunteerU mark everywhere.
  openGraph: {
    title: 'VolunteerU',
    description: 'Volunteer opportunities and nonprofits near you.',
    type: 'website',
    images: ['/icon.png'],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FAF8F5',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300..800&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a className="vu-skip" href="#vu-main">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
