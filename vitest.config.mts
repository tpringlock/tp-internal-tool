import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Mirror tsconfig's "@/*" path alias so tests can import app modules.
export default defineConfig({
  test: {
    // Drop folders of incoming code (see .gitignore) carry their own copies
    // of tests that already live in the repo.
    exclude: [...configDefaults.exclude, "_incoming-billing*/**"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
