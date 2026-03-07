import { execSync } from "child_process";
import { readdirSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "..");
const releasesDir = resolve(root, "releases");
const browsers = ["chrome", "firefox", "edge"];

if (!existsSync(releasesDir)) mkdirSync(releasesDir);

const pkg = JSON.parse(
  new TextDecoder().decode(execSync("cat package.json", { cwd: root })),
);
const version = pkg.version;

for (const browser of browsers) {
  const distDir = resolve(root, "dist", browser);
  if (!existsSync(distDir)) {
    console.error(`dist/${browser} not found — run build:${browser} first`);
    process.exit(1);
  }

  const files = readdirSync(distDir);
  const zipName = `ytm-enhancer-${version}-${browser}.zip`;
  const zipPath = resolve(releasesDir, zipName);

  execSync(`zip -j "${zipPath}" ${files.map((f) => `"${f}"`).join(" ")}`, {
    cwd: distDir,
    stdio: "inherit",
  });

  console.log(`Created ${zipName}`);
}
