/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow the Anthropic SDK in server components
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk'],
  },
  // Proxy Dynamic SDK's wallet-book.json to avoid CORB blocking
  async rewrites() {
    return [
      {
        source: '/dynamic-assets/:path*',
        destination: 'https://wallet-assets.dynamic.xyz/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
