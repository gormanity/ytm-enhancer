import { resolve } from "path";
import { copyFileSync } from "fs";
import { build, Plugin, InlineConfig } from "vite";

function copyAssets(browser: string): Plugin {
  return {
    name: "copy-assets",
    closeBundle() {
      const outDir = resolve(__dirname, `dist/${browser}`);

      copyFileSync(
        resolve(__dirname, `src/manifests/${browser}.json`),
        resolve(outDir, "manifest.json"),
      );

      copyFileSync(
        resolve(__dirname, "src/popup/index.html"),
        resolve(outDir, "popup.html"),
      );

      copyFileSync(
        resolve(__dirname, "src/assets/icon48.png"),
        resolve(outDir, "icon48.png"),
      );

      copyFileSync(
        resolve(__dirname, "src/content/audio-bridge.js"),
        resolve(outDir, "audio-bridge.js"),
      );

      copyFileSync(
        resolve(__dirname, "src/content/quality-bridge.js"),
        resolve(outDir, "quality-bridge.js"),
      );
    },
  };
}

function entryConfig(
  browser: string,
  entry: string,
  format: "es" | "iife",
): InlineConfig {
  return {
    resolve: {
      alias: { "@": resolve(__dirname, "src") },
    },
    build: {
      lib: {
        entry: resolve(__dirname, `src/${entry}/index.ts`),
        formats: [format],
        fileName: () => `${entry}.js`,
        name: entry.replace(/[^a-zA-Z]/g, "_"),
      },
      outDir: `dist/${browser}`,
      target: "ES2022",
      minify: false,
      sourcemap: true,
      emptyOutDir: false,
    },
    define: {
      __BROWSER__: JSON.stringify(browser),
    },
    configFile: false,
    logLevel: "warn",
  };
}

/** Build content and popup after the main background build. */
function buildExtras(browser: string): Plugin {
  return {
    name: "build-extras",
    async closeBundle() {
      // Content script as IIFE (no ES module imports allowed)
      await build(entryConfig(browser, "content", "iife"));
      // Popup as ES module (loaded via <script type="module">)
      await build(entryConfig(browser, "popup", "es"));
    },
  };
}

export function createConfig(browser: string) {
  return {
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    plugins: [buildExtras(browser), copyAssets(browser)],
    build: {
      lib: {
        entry: resolve(__dirname, "src/background/index.ts"),
        formats: ["es" as const],
        fileName: () => "background.js",
        name: "background",
      },
      outDir: `dist/${browser}`,
      target: "ES2022",
      minify: false,
      sourcemap: true,
      emptyOutDir: true,
    },
    define: {
      __BROWSER__: JSON.stringify(browser),
    },
  };
}
