/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workstation/ui", "@workstation/api"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
