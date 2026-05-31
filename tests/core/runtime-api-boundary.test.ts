import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const coreIndexSource = readFileSync(
  resolve(process.cwd(), "src/core/index.ts"),
  "utf-8",
);

describe("runtime API boundary", () => {
  it("exposes YtmRuntimeClient instead of legacy YTM relays", () => {
    expect(coreIndexSource).not.toContain("ActionExecutor");
    expect(coreIndexSource).not.toContain("relayToYTMTab");
    expect(existsSync(resolve(process.cwd(), "src/core/actions.ts"))).toBe(
      false,
    );
    expect(existsSync(resolve(process.cwd(), "src/core/relay.ts"))).toBe(false);
  });
});
