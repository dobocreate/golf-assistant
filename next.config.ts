import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.rakuten.co.jp',
      },
    ],
  },
};

export default nextConfig;
