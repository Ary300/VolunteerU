/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Stock photography and OpenStreetMap tiles are referenced by absolute URL in
  // the design; plain <img> keeps the markup identical to the source file.
  images: { unoptimized: true },
  // The map's every-nonprofit points (public/np-points). The map asks for each
  // state's file with ?v=<index.generated>, so a rebuilt set is a new URL.
  async headers() {
    return [
      { source: '/np-points/index.json', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=86400' }] },
      { source: '/np-points/:file([A-Z]{2}\\.bin)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] },
    ];
  },
};

export default nextConfig;
