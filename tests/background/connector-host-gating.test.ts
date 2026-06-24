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
      "firstPartyNativeHostTransports()",
    );
    expect(
      functionBody("createFirstPartyNativeHostTransport", false),
    ).toContain("createNativeMessagingTransport({");
    expect(
      functionBody("createFirstPartyNativeHostTransport", false),
    ).toContain("hostName: definition.nativeHostName");
    expect(
      functionBody("createFirstPartyNativeHostTransport", false),
    ).toContain("onConnect: () => recordNativeHostAvailable(definition.id)");
    expect(
      functionBody("createFirstPartyNativeHostTransport", false),
    ).toContain("onError: (err) => recordNativeHostError(definition.id, err)");
    expect(
      functionBody("createFirstPartyNativeHostTransport", false),
    ).toContain("onDisconnect:");
    expect(functionBody("firstPartyNativeHostTransports", false)).toContain(
      "firstPartyNativeHostTransportsList",
    );
    expect(functionBody("enableConnectorSupport")).toContain(
      "connectorHost.start();",
    );
  });

  it("reports native host diagnostics through Connected Apps settings", () => {
    expect(backgroundSource).toContain("firstPartyNativeHostDiagnostics");
    expect(backgroundSource).toContain("recordNativeHostError");
    expect(backgroundSource).toContain("nativeHostDiagnostic");
    expect(backgroundSource).toContain("isMissingNativeHostError");
    expect(functionBody("isMissingNativeHostError", false)).toContain(
      "error when communicating with the native messaging host",
    );
    expect(functionBody("connectedAppsSettings", false)).toContain(
      "FIRST_PARTY_CONNECTED_APP_DEFINITIONS.map",
    );
    expect(functionBody("connectedAppsSettings", false)).toContain(
      "nativeHostDiagnostic(definition.id)",
    );
  });

  it("rechecks native host availability when Connected Apps settings are opened", () => {
    expect(backgroundSource).toContain(
      "FIRST_PARTY_NATIVE_HOST_RECHECK_COOLDOWN_MS",
    );
    expect(backgroundSource).toContain("shouldRecheckNativeHostAvailability");
    expect(
      functionBody("shouldRecheckNativeHostAvailability", false),
    ).toContain('diagnostic.availability === "missing"');
    expect(
      functionBody("shouldRecheckNativeHostAvailability", false),
    ).toContain("isNativeHostExitError(diagnostic.lastError)");
    expect(
      functionBody("recheckFirstPartyNativeHostAvailability", false),
    ).toContain("restartFirstPartyNativeHostTransport(definition)");
    expect(
      functionBody("recheckFirstPartyNativeHostAvailability", false),
    ).not.toContain("restartConnectorSupport");
    expect(handlerBody("get-connected-apps-settings")).toContain(
      "recheckFirstPartyNativeHostAvailability();",
    );
  });

  it("can explicitly reconnect a first-party connected app", () => {
    expect(backgroundSource).toContain(
      'handler.on("reconnect-first-party-connected-app"',
    );
    expect(functionBody("reconnectFirstPartyConnectedApp")).toContain(
      "firstPartyConnectedAppDefinition(connectorId)",
    );
    expect(functionBody("reconnectFirstPartyConnectedApp")).toContain(
      "await restartConnectorSupport();",
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

  it("contains connector startup failures inside Connected Apps diagnostics", () => {
    expect(functionBody("startConnectorSupport")).toContain("try {");
    expect(functionBody("startConnectorSupport")).toContain(
      "await enableConnectorSupport();",
    );
    expect(functionBody("startConnectorSupport")).toContain(
      "recordNativeHostError(definition.id, startupError)",
    );
    expect(functionBody("startConnectorSupport")).toContain(
      "disableConnectorSupport();",
    );
  });

  it("suspends production connector support while a dev build is active", () => {
    expect(backgroundSource).toContain(
      "isConnectorSupportSuspendedForDevBuildConflict",
    );
    expect(
      functionBody("isConnectorSupportSuspendedForDevBuildConflict", false),
    ).toContain("!__DEV__ && isDevBuildConflictActive(devBuildConflictState)");
    expect(functionBody("startConnectorSupportIfAvailable")).toContain(
      "disableConnectorSupport();",
    );
    expect(functionBody("startConnectorSupportIfAvailable")).toContain(
      "await startConnectorSupport();",
    );
    expect(functionBody("setConnectorSupportEnabled")).toContain(
      "await startConnectorSupportIfAvailable();",
    );
    expect(functionBody("restartConnectorSupport")).toContain(
      "await startConnectorSupportIfAvailable();",
    );
    expect(functionBody("notifyDevBuildConflictStatusChanged")).toContain(
      "await syncConnectorSupportForDevBuildConflict();",
    );
  });

  it("routes menu bar uninstall requests through the connected first-party session", () => {
    expect(functionBody("requestMenuBarUninstall")).toContain(
      "connectorHost?.requestUninstall",
    );
    expect(functionBody("requestMenuBarUninstall")).toContain(
      "FIRST_PARTY_MENU_BAR_CONNECTOR_ID",
    );
    expect(handlerBody("request-menu-bar-uninstall")).toContain(
      "await requestMenuBarUninstall()",
    );
    expect(handlerBody("request-menu-bar-uninstall")).toContain(
      "Open YTM Menu Bar before requesting uninstall.",
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
      "startConnectorSupport()",
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
    expect(backgroundSource).toContain("updatePlaybackStateIndicators(state)");
  });

  it("streams content playback state only when connector sessions subscribe", () => {
    expect(functionBody("enableConnectorSupport")).toContain(
      "onPlaybackStateSubscriptionChanged",
    );
    expect(backgroundSource).toContain(
      'type: "set-connector-playback-state-streaming"',
    );
    expect(backgroundSource).toContain(
      'handler.on("get-connector-playback-state-streaming"',
    );
    expect(handlerBody("connector-playback-state-changed")).toContain(
      "updatePlaybackStateIndicators(message.state as PlaybackState)",
    );
  });

  it("restores the playing action icon after a dev-build conflict clears", () => {
    expect(backgroundSource).toContain("lastPlaybackStateIsPlaying");
    expect(backgroundSource).toContain("setActionPlaybackIndicator");
    expect(functionBody("notifyDevBuildConflictStatusChanged")).toContain(
      "setActionPlaybackIndicator(lastPlaybackStateIsPlaying, duplicateDetected)",
    );
  });
});
