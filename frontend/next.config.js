/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
      {
        source: '/ws/:path*',
        destination: 'http://localhost:3000/ws/:path*',
      },
      {
        source: '/health',
        destination: 'http://localhost:3000/health',
      },
    ];
  },
};

module.exports = nextConfig;
