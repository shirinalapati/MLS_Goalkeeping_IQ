import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Prevent Next from walking up to a parent lockfile outside this repo.
  turbopack: {
    root: path.join(__dirname),
  },
  // Player profiles are fully generated from static JSON.
  outputFileTracingRoot: path.join(__dirname),
  async redirects() {
    return [
      {
        source: "/methodology",
        destination: "/",
        permanent: true,
      },
      {
        source: "/data-status",
        destination: "/overview#season-coverage",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
