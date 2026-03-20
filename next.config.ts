import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.rakuten.co.jp',
      },
      {
        protocol: 'https',
        hostname: 'gora.golf.rakuten.co.jp',
      },
    ],
  },
};

export default nextConfig;
