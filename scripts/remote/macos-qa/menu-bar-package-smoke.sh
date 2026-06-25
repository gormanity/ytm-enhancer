#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

"$script_dir/crabbox-run.sh" --shell '
  set -eu

  export CI=true
  export SPARKLE_PUBLIC_ED_KEY="${SPARKLE_PUBLIC_ED_KEY:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}"

  pnpm install --frozen-lockfile
  pnpm exec vitest run tests/apps/menu-bar-scaffold.test.ts
  pnpm run menu-bar:package:direct

  node --input-type=module <<'"'"'NODE'"'"'
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

function assertPath(path) {
  if (!existsSync(path)) {
    throw new Error(`Expected path to exist: ${path}`);
  }
}

const metadata = JSON.parse(
  readFileSync("apps/menu-bar/release/metadata.json", "utf-8"),
);
const packageDirectory = resolve("apps/menu-bar/.build/packages");
const packageEntry = readdirSync(packageDirectory)
  .filter((entry) => /^YTM-Menu-Bar-.+\.pkg$/.test(entry))
  .map((entry) => ({
    entry,
    mtimeMs: statSync(resolve(packageDirectory, entry)).mtimeMs,
  }))
  .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

if (!packageEntry) {
  throw new Error(`No YTM Menu Bar package found in ${packageDirectory}`);
}

const packagePath = resolve(packageDirectory, packageEntry.entry);
const expectedAssetPrefix = metadata.channels.direct.assetPrefix;
if (!packageEntry.entry.startsWith(`${expectedAssetPrefix}-`)) {
  throw new Error(
    `Package ${packageEntry.entry} does not use ${expectedAssetPrefix}`,
  );
}
if (!packageEntry.entry.endsWith(".pkg")) {
  throw new Error(`Package ${packageEntry.entry} is not a pkg file`);
}
const expandRoot = resolve("apps/menu-bar/.build/package-smoke-expanded");

assertPath(packagePath);
rmSync(expandRoot, { recursive: true, force: true });

execFileSync("pkgutil", ["--expand-full", packagePath, expandRoot], {
  stdio: "inherit",
});

assertPath(resolve(expandRoot, "Distribution"));
assertPath(resolve(expandRoot, "app.pkg"));
assertPath(resolve(expandRoot, "native-hosts.pkg"));
assertPath(
  resolve(
    expandRoot,
    "app.pkg/Payload/Applications/YTM Menu Bar.app/Contents/Info.plist",
  ),
);
assertPath(
  resolve(
    expandRoot,
    "app.pkg/Payload/Applications/YTM Menu Bar.app/Contents/MacOS/YTMMenuBarConnector",
  ),
);
assertPath(
  resolve(
    expandRoot,
    "app.pkg/Payload/Applications/YTM Menu Bar Uninstaller.command",
  ),
);
assertPath(
  resolve(
    expandRoot,
    "native-hosts.pkg/Payload/Library/Google/Chrome/NativeMessagingHosts/com.gormanity.ytm_enhancer.menu_bar.json",
  ),
);
assertPath(
  resolve(
    expandRoot,
    "native-hosts.pkg/Payload/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.gormanity.ytm_enhancer.menu_bar.json",
  ),
);
assertPath(
  resolve(
    expandRoot,
    "native-hosts.pkg/Payload/Library/Application Support/Mozilla/NativeMessagingHosts/com.gormanity.ytm_enhancer.menu_bar.json",
  ),
);

console.log(`Verified ${packagePath}`);
NODE
'
