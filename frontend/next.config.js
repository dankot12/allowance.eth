/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow the Anthropic SDK in server components
  serverExternalPackages: ['@anthropic-ai/sdk'],
};

module.exports = nextConfig;
