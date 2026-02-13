import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
    return [
      { source: "/api/:path*", destination: `${api}/:path*` },
      { source: "/media/:path*", destination: `${api}/media/:path*` }
    ];
  }
};

export default nextConfig;
