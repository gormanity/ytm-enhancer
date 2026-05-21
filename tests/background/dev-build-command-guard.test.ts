import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(
  resolve(process.cwd(), "src/background/index.ts"),
  "utf-8",
);

function registeredHotkeyBody(command: string): string {
  const pattern = new RegExp(
    `hotkeyRegistry\\.register\\("${command}", async \\(\\) => \\{([\\s\\S]*?)\\n\\}\\);`,
  );
  const match = backgroundSource.match(pattern);
  return match?.[1] ?? "";
}

function handlerBody(type: string): string {
  const start = backgroundSource.indexOf(`handler.on("${type}"`);
  if (start < 0) return "";
  const next = backgroundSource.indexOf("\nhandler.on(", start + 1);
  return backgroundSource.slice(start, next < 0 ? undefined : next);
}

describe("dev build conflict command guards", () => {
  it("does not bypass duplicate guards through the unguarded relay helper", () => {
    expect(backgroundSource).not.toContain("relayToYTMTab");
  });

  it("suppresses focus and reminder hotkeys while prod is duplicate-disabled", () => {
    expect(registeredHotkeyBody("focus-ytm-tab")).toContain(
      "isActionSuppressedForDevBuildConflict(devBuildConflictState, tab.id)",
    );
    expect(registeredHotkeyBody("remind-me")).toContain(
      "isActionSuppressedForDevBuildConflict(devBuildConflictState, tab.id)",
    );
  });

  it("suppresses popup focus requests while prod is duplicate-disabled", () => {
    expect(handlerBody("focus-ytm-tab")).toContain(
      "isActionSuppressedForDevBuildConflict(devBuildConflictState, tab.id)",
    );
  });

  it("suppresses direct content queries while prod is duplicate-disabled", () => {
    for (const type of [
      "get-ytm-tab-artwork",
      "get-stream-quality",
      "get-playback-speed",
      "get-volume",
      "get-playback-state",
    ]) {
      expect(handlerBody(type)).toContain("isYTMTabSuppressed");
    }
  });
});
