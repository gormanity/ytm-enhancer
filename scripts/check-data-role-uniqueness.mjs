import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const MODULES_DIR = "src/modules";
const DATA_ROLE_PATTERN = /data-role="([^"]+)"/g;

function collectHtmlFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectHtmlFiles(fullPath));
    } else if (entry.endsWith(".html")) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectDataRoles(dir) {
  const results = [];
  for (const filePath of collectHtmlFiles(dir)) {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      let match;
      DATA_ROLE_PATTERN.lastIndex = 0;
      while ((match = DATA_ROLE_PATTERN.exec(lines[i])) !== null) {
        results.push({
          value: match[1],
          file: relative(dir, filePath),
          line: i + 1,
        });
      }
    }
  }
  return results;
}

const roles = collectDataRoles(MODULES_DIR);
let failed = false;

// Check uniqueness
const seen = new Map();
const duplicates = [];
for (const entry of roles) {
  const existing = seen.get(entry.value);
  if (existing) {
    duplicates.push({ value: entry.value, first: existing, second: entry });
  } else {
    seen.set(entry.value, entry);
  }
}

if (duplicates.length > 0) {
  failed = true;
  console.error("Duplicate data-role values found across module templates:");
  for (const d of duplicates) {
    console.error(`  "${d.value}"`);
    console.error(`    ${d.first.file}:${d.first.line}`);
    console.error(`    ${d.second.file}:${d.second.line}`);
  }
  console.error(
    "\nEach data-role must be unique. Prefix with the module name.",
  );
}

// Check prefix convention (must contain at least one hyphen)
const unprefixed = roles.filter((r) => !r.value.includes("-"));
if (unprefixed.length > 0) {
  failed = true;
  console.error("\nUnprefixed data-role values found:");
  for (const r of unprefixed) {
    console.error(`  "${r.value}" in ${r.file}:${r.line}`);
  }
  console.error(
    '\nAll data-role values must be prefixed with the module name (e.g., "notifications-toggle").',
  );
}

if (failed) {
  process.exit(1);
} else {
  console.log(
    `Data-role uniqueness check passed (${roles.length} roles across module templates).`,
  );
}
