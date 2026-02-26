import { resolve } from "path";
import { copyFileSync } from "fs";
import { Plugin, UserConfig } from "vite";

function copyManifest(browser: string): Plugin {
  return {
    name: "copy-manifest",
    writeBundle(options) {
      const src = resolve(__dirname, `src/manifests/${browser}.json`);
      const dest = resolve(options.dir!, "manifest.json");
      copyFileSync(src, dest);
    },
  };
}

export function createConfig(browser: string): UserConfig {
  return {
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    plugins: [copyManifest(browser)],
    build: {
      rollupOptions: {
        input: {
          background: resolve(__dirname, "src/background/index.ts"),
          content: resolve(__dirname, "src/content/index.ts"),
          popup: resolve(__dirname, "src/popup/index.ts"),
        },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "chunks/[name].js",
        },
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
