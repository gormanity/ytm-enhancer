import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
