import { defineConfig } from "vitest/config";

// Own config so vitest doesn't walk up into the portal's (which only includes server/**).
export default defineConfig({
  root: import.meta.dirname,
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
