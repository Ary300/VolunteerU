/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Stock photography and OpenStreetMap tiles are referenced by absolute URL in
  // the design; plain <img> keeps the markup identical to the source file.
  images: { unoptimized: true },
};

export default nextConfig;
