import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: { environment: "node", include: ["packages/**/*.test.ts"] },
  resolve: {
    alias: {
      "@wrud/shared": r("./packages/shared/src/index.ts"),
      "@wrud/sdk": r("./packages/sdk/src/index.ts"),
    },
  },
});
