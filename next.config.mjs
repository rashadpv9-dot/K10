/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Old static URLs keep working after the move to Next.js.
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/menu.html", destination: "/menu", permanent: true },
    ];
  },
};

export default nextConfig;
