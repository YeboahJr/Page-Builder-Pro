import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "lib/**/tests/**/*.test.ts",
      "artifacts/**/tests/**/*.test.ts",
      "scripts/tests/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
