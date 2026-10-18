import { Funnel_Display, Figtree } from 'next/font/google';
import './globals.css';
import Providers from '../components/Providers.jsx';

/* Funnel Display for titles and big numbers, Figtree for everything else.
   Self-hosted by next/font and exposed as CSS variables that lib/tokens.js
   (F.display / F.body) and globals.css read. */
const display = Funnel_Display({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-display',
  display: 'swap',
  fallback: ['Figtree', 'system-ui', 'sans-serif'],
});
const body = Figtree({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-body',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
});

export const metadata = {
  metadataBase: new URL('https://www.volunteeruapp.com'),
  title: 'VolunteerU, volunteer opportunities and nonprofits near you',
  description:
    'A free volunteering app for students 13 and up, made by a high school student in Carmel, Indiana. Search opportunities and nonprofits around Carmel and Hamilton County, sign up for shifts, and log hours that organizers confirm in the app.',
  applicationName: 'VolunteerU',
  // Favicon + Apple touch icon come from app/icon.png and app/apple-icon.png
  // (Next.js file conventions), so the browser tab / home-screen icon is the
  // VolunteerU mark everywhere.
  // A shared link to / or /discover previews as a photo card. /join/<id>
  // sets its own openGraph (the listing's photo), which replaces this one.
  openGraph: {
    title: 'VolunteerU, volunteer opportunities and nonprofits near you',
    description: 'Volunteer opportunities and nonprofits around Carmel, Indiana. Free for students 13 and up.',
    type: 'website',
    siteName: 'VolunteerU',
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'Volunteers handing out water at a food drive' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VolunteerU, volunteer opportunities and nonprofits near you',
    description: 'Volunteer opportunities and nonprofits around Carmel, Indiana. Free for students 13 and up.',
    images: ['/og.jpg'],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFFFFF',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <a className="vu-skip" href="#vu-main">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
