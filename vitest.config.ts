import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web"),
      "@workgate/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@workgate/db": path.resolve(__dirname, "packages/db/src/index.ts"),
      "@workgate/github": path.resolve(__dirname, "packages/github/src/index.ts"),
      "@workgate/agents": path.resolve(__dirname, "packages/agents/src/index.ts"),
      "@workgate/runtime": path.resolve(__dirname, "packages/runtime/src/index.ts")
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
