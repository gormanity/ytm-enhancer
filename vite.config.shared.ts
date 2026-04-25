import { resolve, dirname } from "path";
import { readFileSync, copyFileSync, writeFileSync } from "fs";
import sharp from "sharp";
import { build, Plugin, InlineConfig } from "vite";

const DEFAULT_ICON_SIZES = [16, 48, 128];
const STORE_ICON_SIZES: Partial<Record<string, number[]>> = {
  edge: [300],
};

async function generateIcons(browser: string, outDir: string): Promise<void> {
  const svgBuffer = readFileSync(resolve(__dirname, "src/assets/icon.svg"));
  const iconSizes = [
    ...DEFAULT_ICON_SIZES,
    ...(STORE_ICON_SIZES[browser] ?? []),
  ];
  await Promise.all(
    iconSizes.map((size) =>
      sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(resolve(outDir, `icon${size}.png`)),
    ),
  );
}

/** Inline CSS `@import` statements by replacing them with file contents. */
function bundleCss(filePath: string): string {
  const dir = dirname(filePath);
  const css = readFileSync(filePath, "utf-8");
  return css.replace(
    /@import\s+["']([^"']+)["']\s*;/g,
    (_match, importPath: string) => {
      const resolved = resolve(dir, importPath);
      return readFileSync(resolved, "utf-8");
    },
  );
}

function outDirFor(browser: string, isDev: boolean): string {
  return isDev ? `dist-dev/${browser}` : `dist/${browser}`;
}

function copyAssets(browser: string, isDev: boolean): Plugin {
  return {
    name: "copy-assets",
    async closeBundle() {
      const outDir = resolve(__dirname, outDirFor(browser, isDev));

      const manifest = JSON.parse(
        readFileSync(
          resolve(__dirname, `src/manifests/${browser}.json`),
          "utf-8",
        ),
      );
      if (isDev) {
        manifest.name += " (dev)";
      }
      writeFileSync(
        resolve(outDir, "manifest.json"),
        JSON.stringify(manifest, null, 2) + "\n",
      );

      copyFileSync(
        resolve(__dirname, "src/popup/index.html"),
        resolve(outDir, "popup.html"),
      );
      writeFileSync(
        resolve(outDir, "index.css"),
        bundleCss(resolve(__dirname, "src/popup/index.css")),
      );

      await generateIcons(browser, outDir);

      copyFileSync(
        resolve(__dirname, "src/assets/preview-artwork.png"),
        resolve(outDir, "preview-artwork.png"),
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
  isDev: boolean,
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
      outDir: outDirFor(browser, isDev),
      target: "ES2022",
      minify: false,
      sourcemap: true,
      emptyOutDir: false,
    },
    define: {
      __BROWSER__: JSON.stringify(browser),
      __DEV__: JSON.stringify(isDev),
    },
    configFile: false,
    logLevel: "warn",
  };
}

/** Build content and popup after the main background build. */
function buildExtras(browser: string, isDev: boolean): Plugin {
  return {
    name: "build-extras",
    async closeBundle() {
      // Content script as IIFE (no ES module imports allowed)
      await build(entryConfig(browser, "content", "iife", isDev));
      // Popup as ES module (loaded via <script type="module">)
      await build(entryConfig(browser, "popup", "es", isDev));
    },
  };
}

export function createConfig(browser: string, mode = "production") {
  const isDev = mode === "development";
  return {
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    plugins: [buildExtras(browser, isDev), copyAssets(browser, isDev)],
    build: {
      lib: {
        entry: resolve(__dirname, "src/background/index.ts"),
        formats: ["es" as const],
        fileName: () => "background.js",
        name: "background",
      },
      outDir: outDirFor(browser, isDev),
      target: "ES2022",
      minify: false,
      sourcemap: true,
      emptyOutDir: true,
    },
    define: {
      __BROWSER__: JSON.stringify(browser),
      __DEV__: JSON.stringify(isDev),
    },
  };
}
