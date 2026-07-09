import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vitest/config";

// Mirrors the esbuild base64 loader used by the api-server build so tests can
// import modules that pull in .png/.ttf assets (e.g. the Akte PDF builder).
const base64AssetLoader: Plugin = {
  name: "base64-asset-loader",
  transform(_code, id) {
    if (!/\.(png|ttf)$/.test(id)) return null;
    const data = readFileSync(id).toString("base64");
    return { code: `export default ${JSON.stringify(data)};`, map: null };
  },
};

export default defineConfig({
  plugins: [base64AssetLoader],
  test: {
    include: [
      "lib/**/tests/**/*.test.ts",
      "artifacts/**/tests/**/*.test.ts",
      "scripts/tests/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
