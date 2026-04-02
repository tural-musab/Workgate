import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web"),
      "@aiteams/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@aiteams/db": path.resolve(__dirname, "packages/db/src/index.ts"),
      "@aiteams/github": path.resolve(__dirname, "packages/github/src/index.ts"),
      "@aiteams/agents": path.resolve(__dirname, "packages/agents/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
