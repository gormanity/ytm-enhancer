import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const POPUP_HTML_PATH = "src/popup/index.html";
const POPUP_CSS_PATH = "src/popup/index.css";
const SEARCH_ROOTS = ["src/popup", "src/modules"];
const SOURCE_EXTENSIONS = new Set([".ts", ".html"]);

const SAFELIST = new Set([
  // Add selector names here if they are truly dynamic and intentionally not
  // discoverable by the static scans below.
]);

function collectFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const fullPath = join(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    if ([...SOURCE_EXTENSIONS].some((ext) => fullPath.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractSelectorTokens(cssText) {
  const tokens = new Set();
  const selectorMatches = cssText.match(/[^{}]+(?=\{)/g) ?? [];

  for (const rawSelectorGroup of selectorMatches) {
    const selectorGroup = rawSelectorGroup.trim();
    if (!selectorGroup || selectorGroup.startsWith("@")) continue;

    for (const rawSelector of selectorGroup.split(",")) {
      const selector = rawSelector.trim();
      if (!selector) continue;
      const matches = selector.matchAll(/([.#])([A-Za-z_][A-Za-z0-9_-]*)/g);
      for (const match of matches) {
        const prefix = match[1];
        const name = match[2];
        tokens.add(`${prefix}${name}`);
      }
    }
  }

  return tokens;
}

function extractUsedTokens(text) {
  const used = new Set();

  const classAttrMatches = text.matchAll(/\bclass\s*=\s*["']([^"']+)["']/g);
  for (const match of classAttrMatches) {
    for (const token of match[1].split(/\s+/).filter(Boolean)) {
      if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) {
        used.add(`.${token}`);
      }
    }
  }

  const idAttrMatches = text.matchAll(
    /\bid\s*=\s*["']([A-Za-z_][A-Za-z0-9_-]*)["']/g,
  );
  for (const match of idAttrMatches) {
    used.add(`#${match[1]}`);
  }

  const setAttrMatches = text.matchAll(
    /\bsetAttribute\(\s*["'`](class|id)["'`]\s*,\s*["'`]([^"'`]+)["'`]\s*\)/g,
  );
  for (const match of setAttrMatches) {
    if (match[1] === "class") {
      for (const token of match[2].split(/\s+/).filter(Boolean)) {
        if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) {
          used.add(`.${token}`);
        }
      }
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(match[2])) {
      used.add(`#${match[2]}`);
    }
  }

  const classNameMatches = text.matchAll(
    /\bclassName\s*=\s*["'`]([^"'`]+)["'`]/g,
  );
  for (const match of classNameMatches) {
    for (const token of match[1].split(/\s+/).filter(Boolean)) {
      used.add(`.${token}`);
    }
  }

  const classListMatches = text.matchAll(
    /\bclassList\.(?:add|remove|toggle|contains)\(([^)]+)\)/g,
  );
  for (const match of classListMatches) {
    const stringTokens = match[1].match(/["'`]([A-Za-z_][A-Za-z0-9_-]*)["'`]/g);
    if (!stringTokens) continue;
    for (const token of stringTokens) {
      used.add(`.${token.slice(1, -1)}`);
    }
  }

  const selectorMatches = text.matchAll(
    /\b(?:querySelector|querySelectorAll)\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  );
  for (const match of selectorMatches) {
    const selector = match[1];
    for (const tokenMatch of selector.matchAll(
      /([.#])([A-Za-z_][A-Za-z0-9_-]*)/g,
    )) {
      used.add(`${tokenMatch[1]}${tokenMatch[2]}`);
    }
  }

  const getByIdMatches = text.matchAll(
    /\bgetElementById\(\s*["'`]([A-Za-z_][A-Za-z0-9_-]*)["'`]\s*\)/g,
  );
  for (const match of getByIdMatches) {
    used.add(`#${match[1]}`);
  }

  return used;
}

const popupCss = readFileSync(POPUP_CSS_PATH, "utf8");
const cssTokens = extractSelectorTokens(popupCss);

const files = [
  ...new Set([POPUP_HTML_PATH, ...SEARCH_ROOTS.flatMap(collectFiles)]),
];
const usedTokens = new Set();
for (const filePath of files) {
  const fileText = readFileSync(filePath, "utf8");
  for (const token of extractUsedTokens(fileText)) {
    usedTokens.add(token);
  }
}

const deadTokens = [...cssTokens].filter(
  (token) => !usedTokens.has(token) && !SAFELIST.has(token),
);

if (deadTokens.length > 0) {
  deadTokens.sort();
  console.error("Dead popup CSS selectors detected:");
  for (const token of deadTokens) {
    console.error(`  - ${token}`);
  }
  process.exit(1);
}

console.log(`Popup CSS check passed (${cssTokens.size} selectors referenced).`);
