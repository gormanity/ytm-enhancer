import { execFileSync } from "child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "..");
const releasesDir = resolve(root, "releases");
const browsers = ["chrome", "firefox", "edge"];

if (!existsSync(releasesDir)) mkdirSync(releasesDir);

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
const version = pkg.version;

function stagePackage(browser, distDir) {
  const stageDir = mkdtempSync(resolve(tmpdir(), `ytm-enhancer-${browser}-`));
  for (const file of readdirSync(distDir)) {
    cpSync(resolve(distDir, file), resolve(stageDir, file), {
      recursive: true,
    });
  }

  if (browser === "chrome") {
    const manifestPath = resolve(stageDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    delete manifest.key;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }

  return stageDir;
}

for (const browser of browsers) {
  const distDir = resolve(root, "dist", browser);
  if (!existsSync(distDir)) {
    console.error(`dist/${browser} not found — run build:${browser} first`);
    process.exit(1);
  }

  const zipName = `ytm-enhancer-${version}-${browser}.zip`;
  const zipPath = resolve(releasesDir, zipName);
  const stageDir = stagePackage(browser, distDir);

  try {
    if (existsSync(zipPath)) rmSync(zipPath);
    const files = readdirSync(stageDir);
    execFileSync("zip", ["-j", zipPath, ...files], {
      cwd: stageDir,
      stdio: "inherit",
    });
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }

  console.log(`Created ${zipName}`);
}
