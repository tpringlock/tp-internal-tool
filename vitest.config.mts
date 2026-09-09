import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirror tsconfig's "@/*" path alias so tests can import app modules.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
