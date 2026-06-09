import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(
  resolve(process.cwd(), "src/background/index.ts"),
  "utf-8",
);

function sourceBefore(functionName: string): string {
  const start = backgroundSource.indexOf(`async function ${functionName}`);
  return start < 0 ? backgroundSource : backgroundSource.slice(0, start);
}

function functionBody(functionName: string): string {
  const start = backgroundSource.indexOf(`async function ${functionName}`);
  if (start < 0) return "";
  const next = backgroundSource.indexOf("\nasync function ", start + 1);
  return backgroundSource.slice(start, next < 0 ? undefined : next);
}

describe("connector host background gating", () => {
  it("does not create or start the connector host at background startup", () => {
    const startupSource = sourceBefore("enableConnectorSupport");

    expect(backgroundSource).not.toContain("CONNECTOR_HOST_ENABLED_DEFAULT");
    expect(startupSource).not.toContain("createConnectorHost");
    expect(startupSource).not.toContain("connectorHost.start();");
  });

  it("only enables connector support from persisted module state", () => {
    expect(backgroundSource).toContain('state["connectors.enabled"] === true');
    expect(backgroundSource).toContain("enableConnectorSupport()");
    expect(functionBody("enableConnectorSupport")).toContain(
      "createConnectorHost",
    );
    expect(functionBody("enableConnectorSupport")).toContain(
      "connectorHost.start();",
    );
  });
});
