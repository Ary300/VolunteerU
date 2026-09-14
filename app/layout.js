import './globals.css';
import Providers from '../components/Providers.jsx';

export const metadata = {
  metadataBase: new URL('https://www.volunteeruapp.com'),
  title: 'VolunteerU, volunteering built around you',
  description:
    'Tell us who you are and we find real openings near you, or hand you everything you need to run your own organization. Either way the hours verify themselves.',
  applicationName: 'VolunteerU',
  // Favicon + Apple touch icon come from app/icon.png and app/apple-icon.png
  // (Next.js file conventions), so the browser tab / home-screen icon is the
  // VolunteerU mark everywhere.
  openGraph: {
    title: 'VolunteerU',
    description: 'Volunteering built around you.',
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
