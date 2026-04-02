import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@aiteams/shared", "@aiteams/db", "@aiteams/github", "@aiteams/agents"]
};

export default nextConfig;

