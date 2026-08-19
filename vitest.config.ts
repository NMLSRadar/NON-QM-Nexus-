import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    globalSetup: ["./tests/integration/generatedTestUserCleanup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "src/**/*.test.ts"],
    // Default reporter for normal human-readable output, plus a guard that
    // only activates when REQUIRE_INTEGRATION=1 (see
    // tests/integration/requireIntegrationReporter.ts): it fails the process
    // if every collected integration test skipped, so a live-database run
    // with missing credentials can never look like a silent pass.
    reporters: ["default", "./tests/integration/requireIntegrationReporter.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**/*.ts"],
      reporter: ["text", "html"],
    },
  },
});
