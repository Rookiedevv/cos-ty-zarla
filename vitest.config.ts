import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // "server-only" throws outside Next's server build; tests run plain Node.
      "server-only": fileURLToPath(new URL("./test/empty.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
