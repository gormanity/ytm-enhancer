import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateConnectorMessage } from "@ytm-enhancer/connector-protocol";

function readFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "packages/connector-protocol/fixtures", name),
      "utf-8",
    ),
  );
}

describe("connector protocol fixtures", () => {
  it("keeps the CLI hello fixture valid", () => {
    const result = validateConnectorMessage(readFixture("cli-hello.json"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.type).toBe("connector.hello");
    if (result.value.type !== "connector.hello") return;
    expect(result.value.manifest.id).toBe("com.gormanity.ytm-enhancer.cli");
  });

  it("keeps the playback state fixture stable for external apps", () => {
    const fixture = readFixture("playback-state.json") as {
      type?: string;
      state?: { title?: string; nextTrack?: { title?: string } };
    };

    expect(fixture.type).toBe("playback.state");
    expect(fixture.state?.title).toBe("A Walk");
    expect(fixture.state?.nextTrack?.title).toBe("Send And Receive");
  });

  it("validates YTM status requests for external apps", () => {
    const result = validateConnectorMessage({
      type: "ytm.getStatus",
      requestId: "ytm-status-1",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        type: "ytm.getStatus",
        requestId: "ytm-status-1",
      },
    });
  });
});
