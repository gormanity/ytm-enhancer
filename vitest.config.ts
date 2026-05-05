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
    __BROWSER__: JSON.stringify("chrome"),
    __BUILD_TIMESTAMP__: JSON.stringify("2026-05-05T13:26:00.000Z"),
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
