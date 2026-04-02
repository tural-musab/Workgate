import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@workgate/shared", "@workgate/db", "@workgate/github", "@workgate/agents", "@workgate/runtime"]
};

export default nextConfig;
