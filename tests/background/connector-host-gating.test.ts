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

function functionBody(functionName: string, async = true): string {
  const start = backgroundSource.indexOf(
    `${async ? "async " : ""}function ${functionName}`,
  );
  if (start < 0) return "";
  const nextAsync = backgroundSource.indexOf("\nasync function ", start + 1);
  const nextSync = backgroundSource.indexOf("\nfunction ", start + 1);
  const nextCandidates = [nextAsync, nextSync].filter((index) => index >= 0);
  const next = nextCandidates.length > 0 ? Math.min(...nextCandidates) : -1;
  return backgroundSource.slice(start, next < 0 ? undefined : next);
}

function handlerBody(messageType: string): string {
  const start = backgroundSource.indexOf(`handler.on("${messageType}"`);
  if (start < 0) return "";
  const next = backgroundSource.indexOf("\nhandler.on(", start + 1);
  return backgroundSource.slice(start, next < 0 ? undefined : next);
}

describe("connector host background gating", () => {
  it("does not create or start the connector host at background startup", () => {
    const startupSource = sourceBefore("enableConnectorSupport");

    expect(backgroundSource).not.toContain("CONNECTOR_HOST_ENABLED_DEFAULT");
    expect(startupSource).not.toContain("connectorHost = createConnectorHost");
    expect(startupSource).not.toContain("connectorHost.start();");
  });

  it("does not use dynamic imports in the extension service worker", () => {
    expect(backgroundSource).not.toContain("import(");
  });

  it("only enables connector support from persisted module state", () => {
    expect(backgroundSource).toContain("CONNECTORS_ENABLED_STATE_KEY");
    expect(backgroundSource).toContain("createNativeMessagingTransport");
    expect(backgroundSource).toContain(
      "connectorSupportEnabled = bool(CONNECTORS_ENABLED_STATE_KEY, false)",
    );
    expect(backgroundSource).toContain("enableConnectorSupport()");
    expect(functionBody("enableConnectorSupport")).toContain(
      "createConnectorHost",
    );
    expect(functionBody("enableConnectorSupport")).toContain(
      "transports: [createNativeMessagingTransport()]",
    );
    expect(functionBody("enableConnectorSupport")).toContain(
      "connectorHost.start();",
    );
  });

  it("can stop and discard the connector host when the popup disables support", () => {
    expect(backgroundSource).toContain(
      'handler.on("set-connected-apps-enabled"',
    );
    expect(functionBody("setConnectorSupportEnabled")).toContain(
      "disableConnectorSupport()",
    );
    expect(functionBody("disableConnectorSupport", false)).toContain(
      "connectorHost?.setEnabled(false)",
    );
    expect(functionBody("disableConnectorSupport", false)).toContain(
      "connectorHost = null",
    );
  });

  it("restarts connector support when a known connector is re-enabled", () => {
    expect(functionBody("restartConnectorSupport")).toContain(
      "connectorSupportEnabled",
    );
    expect(functionBody("restartConnectorSupport")).toContain(
      "disableConnectorSupport()",
    );
    expect(functionBody("restartConnectorSupport")).toContain(
      "enableConnectorSupport()",
    );
    expect(handlerBody("set-connector-enabled")).toContain(
      "await restartConnectorSupport();",
    );
  });

  it("publishes module playback state events to connector sessions", () => {
    expect(backgroundSource).toContain(
      'context.events.on<PlaybackState>("playback-state-changed"',
    );
    expect(backgroundSource).toContain("connectorHost?.publishPlaybackState");
  });
});
