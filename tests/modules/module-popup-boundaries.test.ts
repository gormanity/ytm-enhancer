import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

function findPopupSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findPopupSources(path);
    return entry.isFile() && entry.name === "popup.ts" ? [path] : [];
  });
}

const modulePopupSources = findPopupSources(join(process.cwd(), "src/modules"));

describe("module popup boundaries", () => {
  it("does not call raw runtime messaging from module popup views", () => {
    const offenders = modulePopupSources
      .map((path) => ({
        path: relative(process.cwd(), path),
        source: readFileSync(path, "utf-8"),
      }))
      .filter(({ source }) => source.includes("chrome.runtime.sendMessage"))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("does not call raw extension runtime APIs from module popup views", () => {
    const offenders = modulePopupSources
      .map((path) => ({
        path: relative(process.cwd(), path),
        source: readFileSync(path, "utf-8"),
      }))
      .filter(({ source }) => source.includes("chrome.runtime"))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("uses ModuleContext runtime subscriptions instead of raw listener helpers", () => {
    const offenders = modulePopupSources
      .map((path) => ({
        path: relative(process.cwd(), path),
        source: readFileSync(path, "utf-8"),
      }))
      .filter(({ source }) => source.includes("@/core/runtime-listener"))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("does not call raw browser shortcut APIs from module popup views", () => {
    const forbidden = ["chrome.commands", "chrome.tabs.create"];
    const offenders = modulePopupSources
      .map((path) => ({
        path: relative(process.cwd(), path),
        source: readFileSync(path, "utf-8"),
      }))
      .filter(({ source }) => forbidden.some((token) => source.includes(token)))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
