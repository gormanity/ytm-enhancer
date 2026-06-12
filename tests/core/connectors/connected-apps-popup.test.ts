import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConnectedAppsPopupView,
  type ConnectedAppsClient,
  type ConnectedAppsSettings,
} from "@/core/connectors/popup";
import { createTestModuleContext } from "../../helpers/module-context";

function createClient(
  initialSettings: ConnectedAppsSettings,
): ConnectedAppsClient {
  let settings = structuredClone(initialSettings);

  return {
    getSettings: vi.fn(async () => structuredClone(settings)),
    setGlobalEnabled: vi.fn(async (enabled: boolean) => {
      settings = { ...settings, enabled };
    }),
    setConnectorEnabled: vi.fn(async (id: string, enabled: boolean) => {
      settings = {
        ...settings,
        connectors: settings.connectors.map((connector) =>
          connector.id === id
            ? {
                ...connector,
                enabled,
                status: enabled ? "disconnected" : "blocked",
              }
            : connector,
        ),
      };
    }),
    forgetConnector: vi.fn(async (id: string) => {
      settings = {
        ...settings,
        connectors: settings.connectors.filter(
          (connector) => connector.id !== id,
        ),
      };
    }),
    subscribeChanged: vi.fn(() => () => undefined),
  };
}

describe("Connected Apps popup view", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    });
  });

  it("returns module-like popup view metadata", () => {
    const view = createConnectedAppsPopupView(createTestModuleContext());

    expect(view.id).toBe("connected-apps");
    expect(view.label).toBe("Connected Apps");
  });

  it("loads and persists the global Connected Apps toggle", async () => {
    const client = createClient({ enabled: false, connectors: [] });
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    const toggle = container.querySelector<HTMLInputElement>(
      '[data-role="connected-apps-enabled-toggle"]',
    );

    await vi.waitFor(() => {
      expect(toggle?.disabled).toBe(false);
      expect(toggle?.checked).toBe(false);
    });

    toggle!.checked = true;
    toggle!.dispatchEvent(new Event("change"));

    expect(client.setGlobalEnabled).toHaveBeenCalledWith(true);
  });

  it("renders known connectors with status and permission labels", async () => {
    const client = createClient({
      enabled: true,
      connectors: [
        {
          id: "com.example.menu-bar",
          name: "YTM Menu Bar",
          version: "0.1.0",
          protocolVersion: "1.0.0",
          permissions: ["playback:read", "playback:control", "ytm:focus"],
          enabled: true,
          status: "connected",
          lastSeenAt: null,
          lastConnectedAt: null,
        },
      ],
    });
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      expect(container.textContent).toContain("YTM Menu Bar");
      expect(container.textContent).toContain("Connected");
      expect(container.textContent).toContain("Playback Info");
      expect(container.textContent).toContain("Playback Controls");
      expect(container.textContent).toContain("Focus YouTube Music");
    });

    const connectorToggle = container.querySelector<HTMLInputElement>(
      '[data-role="connected-app-enabled-toggle"][data-connector-id="com.example.menu-bar"]',
    );
    expect(connectorToggle?.checked).toBe(true);
  });

  it("persists individual connector enablement", async () => {
    const client = createClient({
      enabled: true,
      connectors: [
        {
          id: "com.example.menu-bar",
          name: "YTM Menu Bar",
          version: "0.1.0",
          protocolVersion: "1.0.0",
          permissions: ["playback:read"],
          enabled: true,
          status: "disconnected",
          lastSeenAt: null,
          lastConnectedAt: null,
        },
      ],
    });
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    const toggle = await vi.waitFor(() => {
      const input = container.querySelector<HTMLInputElement>(
        '[data-role="connected-app-enabled-toggle"]',
      );
      expect(input).not.toBeNull();
      return input!;
    });

    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));

    expect(client.setConnectorEnabled).toHaveBeenCalledWith(
      "com.example.menu-bar",
      false,
    );
  });

  it("forgets a connector and refreshes the registered app list", async () => {
    const client = createClient({
      enabled: true,
      connectors: [
        {
          id: "com.example.menu-bar",
          name: "YTM Menu Bar",
          version: "0.1.0",
          protocolVersion: "1.0.0",
          permissions: ["playback:read"],
          enabled: true,
          status: "disconnected",
          lastSeenAt: null,
          lastConnectedAt: null,
        },
      ],
    });
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    const button = await vi.waitFor(() => {
      const element = container.querySelector<HTMLButtonElement>(
        '[data-role="connected-app-forget-button"]',
      );
      expect(element).not.toBeNull();
      return element!;
    });

    button.click();

    expect(client.forgetConnector).toHaveBeenCalledWith("com.example.menu-bar");
    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-connector-id="com.example.menu-bar"]'),
      ).toBeNull();
      expect(container.textContent).toContain("No connected apps registered");
    });
  });

  it("shows first-party menu bar install options before it is registered", async () => {
    const client = createClient({ enabled: true, connectors: [] });
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      expect(container.textContent).toContain("YTM Menu Bar");
      expect(container.textContent).toContain("Download for macOS");
      expect(container.textContent).toContain(
        "brew install --cask gormanity/tap/ytm-menu-bar",
      );
      expect(container.textContent).toContain(
        "Updates are handled by the menu bar app or Homebrew.",
      );
    });

    const directLink = container.querySelector<HTMLAnchorElement>(
      '[data-role="connected-app-menu-bar-direct-link"]',
    );
    const homebrewCode = container.querySelector<HTMLElement>(
      '[data-role="connected-app-menu-bar-homebrew-command"]',
    );

    expect(directLink?.href).toContain("/releases");
    expect(homebrewCode?.textContent).toBe(
      "brew install --cask gormanity/tap/ytm-menu-bar",
    );
  });

  it("shows update guidance for incompatible first-party menu bar connectors", async () => {
    const client = createClient({
      enabled: true,
      connectors: [
        {
          id: "com.gormanity.ytm-enhancer.menu-bar",
          name: "YTM Menu Bar",
          version: "0.0.1",
          protocolVersion: "0.1.0",
          permissions: ["playback:read"],
          enabled: true,
          status: "incompatible",
          lastSeenAt: null,
          lastConnectedAt: null,
        },
      ],
    });
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Update required");
      expect(container.textContent).toContain(
        "Use Check for Updates in YTM Menu Bar, or run brew upgrade --cask ytm-menu-bar.",
      );
    });
  });
});
