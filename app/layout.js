import './globals.css';
import Providers from '../components/Providers.jsx';

export const metadata = {
  title: 'VolunteerU — volunteering built around you',
  description:
    'Tell us who you are and we find real openings near you, or hand you everything you need to run your own organization. Either way the hours verify themselves.',
  applicationName: 'VolunteerU',
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%23C2603C'/%3E%3Ctext x='16' y='22' font-family='Helvetica,Arial' font-size='17' font-weight='700' fill='white' text-anchor='middle'%3EV%3C/text%3E%3C/svg%3E",
      },
    ],
  },
  openGraph: {
    title: 'VolunteerU',
    description: 'Volunteering built around you.',
    type: 'website',
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
