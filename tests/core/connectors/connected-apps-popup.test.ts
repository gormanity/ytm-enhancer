import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConnectedAppsPopupView,
  type ConnectedAppsClient,
  type ConnectedAppsSettings,
} from "@/core/connectors/popup";
import { createMenuBarConnectedApp } from "@/core/connectors/settings";
import { createTestModuleContext } from "../../helpers/module-context";

type SettingsInput = Omit<Partial<ConnectedAppsSettings>, "menuBarApp"> & {
  menuBarApp?: Partial<ConnectedAppsSettings["menuBarApp"]>;
};

function createSettings(input: SettingsInput = {}): ConnectedAppsSettings {
  return {
    enabled: false,
    connectors: [],
    ...input,
    menuBarApp: createMenuBarConnectedApp(input.menuBarApp),
  };
}

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
    const client = createClient(createSettings({ enabled: false }));
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

  it("renders connected apps once with compact collapsed rows", async () => {
    const client = createClient(
      createSettings({
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
      }),
    );
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      expect(
        container.querySelectorAll('[data-app-id="com.example.menu-bar"]')
          .length,
      ).toBe(1);
    });
    expect(container.textContent).not.toContain("Registered Apps");

    const card = container.querySelector<HTMLDetailsElement>(
      '[data-app-id="com.example.menu-bar"]',
    );
    expect(card?.open).toBe(false);
    expect(
      card?.querySelector('[data-role="connected-app-name"]')?.textContent,
    ).toContain("YTM Menu Bar");
    expect(
      card?.querySelector('[data-role="connected-app-status"]')?.textContent,
    ).toContain("Connected");
    expect(
      card?.querySelector('[data-role="connected-app-summary"]')?.textContent,
    ).toContain("External app connected to YTM Enhancer.");
    expect(card?.textContent).toContain("Shared by YTM Enhancer");
    expect(card?.textContent).toContain("Playback info and progress");
    expect(card?.textContent).toContain("Playback controls");
    expect(card?.textContent).toContain("Focus YouTube Music");

    const lifecycleButton = container.querySelector<HTMLButtonElement>(
      '[data-role="connected-app-lifecycle-button"][data-connector-id="com.example.menu-bar"]',
    );
    expect(lifecycleButton?.textContent).toContain("Disable App");
  });

  it("disables a connector without removing it from the app list", async () => {
    const client = createClient(
      createSettings({
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
      }),
    );
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    const card = await vi.waitFor(() => {
      const card = container.querySelector<HTMLDetailsElement>(
        '[data-app-id="com.example.menu-bar"]',
      );
      expect(card).not.toBeNull();
      return card!;
    });
    card.open = true;
    card.dispatchEvent(new Event("toggle"));

    const button = await vi.waitFor(() => {
      const element = container.querySelector<HTMLButtonElement>(
        '[data-role="connected-app-lifecycle-button"]',
      );
      expect(element).not.toBeNull();
      return element!;
    });
    expect(button.textContent).toContain("Disable App");

    button.click();

    expect(client.setConnectorEnabled).toHaveBeenCalledWith(
      "com.example.menu-bar",
      false,
    );
    await vi.waitFor(() => {
      const refreshedCard = container.querySelector<HTMLDetailsElement>(
        '[data-app-id="com.example.menu-bar"]',
      );
      expect(refreshedCard).not.toBe(card);
      expect(refreshedCard?.open).toBe(true);
      expect(refreshedCard?.textContent).toContain("Disabled");
      expect(refreshedCard?.textContent).toContain("Enable App");
      expect(
        refreshedCard?.querySelector(
          '[data-connector-id="com.example.menu-bar"]',
        ),
      ).not.toBeNull();
    });
  });

  it("re-enables a disabled connector from the app action", async () => {
    const client = createClient(
      createSettings({
        enabled: true,
        connectors: [
          {
            id: "com.example.menu-bar",
            name: "YTM Menu Bar",
            version: "0.1.0",
            protocolVersion: "1.0.0",
            permissions: ["playback:read"],
            enabled: false,
            status: "blocked",
            lastSeenAt: null,
            lastConnectedAt: null,
          },
        ],
      }),
    );
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    const button = await vi.waitFor(() => {
      const element = container.querySelector<HTMLButtonElement>(
        '[data-role="connected-app-lifecycle-button"]',
      );
      expect(element).not.toBeNull();
      return element!;
    });
    expect(button.textContent).toContain("Enable App");

    button.click();

    expect(client.setConnectorEnabled).toHaveBeenCalledWith(
      "com.example.menu-bar",
      true,
    );
    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-connector-id="com.example.menu-bar"]'),
      ).not.toBeNull();
      expect(container.textContent).toContain("Disconnected");
      expect(container.textContent).toContain("Disable App");
    });
  });

  it("shows uninstall as the install action for disabled installed menu bar apps", async () => {
    const client = createClient(
      createSettings({
        enabled: true,
        connectors: [
          {
            id: "com.gormanity.ytm-enhancer.menu-bar",
            name: "YTM Menu Bar",
            version: "0.1.0",
            protocolVersion: "1.0.0",
            permissions: ["playback:read"],
            enabled: false,
            status: "blocked",
            lastSeenAt: null,
            lastConnectedAt: null,
          },
        ],
        menuBarApp: { availability: "available" },
      }),
    );
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    const uninstallLink = await vi.waitFor(() => {
      const element = container.querySelector<HTMLAnchorElement>(
        '[data-role="connected-app-install-link"]',
      );
      expect(element).not.toBeNull();
      return element!;
    });

    expect(uninstallLink.textContent).toContain("Uninstall...");
    expect(uninstallLink.href).toBe(
      "https://gormanity.github.io/ytm-enhancer/menu-bar/install.html#uninstall",
    );
    expect(container.textContent).toContain("Enable App");
  });

  it("shows first-party menu bar install options before it is registered", async () => {
    const client = createClient(createSettings({ enabled: true }));
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    const card = await vi.waitFor(() => {
      const element = container.querySelector<HTMLDetailsElement>(
        '[data-app-id="com.gormanity.ytm-enhancer.menu-bar"]',
      );
      expect(element).not.toBeNull();
      return element!;
    });
    expect(card.open).toBe(false);
    expect(card.textContent).toContain("YTM Menu Bar");
    expect(card.textContent).toContain("Available");
    expect(card.textContent).toContain("Download for macOS");
    expect(card.textContent).not.toContain("Install with Homebrew");
    expect(card.textContent).not.toContain(
      "brew install --cask gormanity/tap/ytm-menu-bar",
    );
    expect(card.textContent).not.toContain(
      "Direct installs update from the app. Homebrew installs update with Homebrew.",
    );

    const directLink = card.querySelector<HTMLAnchorElement>(
      '[data-role="connected-app-install-link"]',
    );

    expect(directLink?.href).toBe(
      "https://gormanity.github.io/ytm-enhancer/menu-bar/install.html",
    );
  });

  it("uses a shared action style for install and lifecycle actions", async () => {
    const client = createClient(
      createSettings({
        enabled: true,
        connectors: [
          {
            id: "com.gormanity.ytm-enhancer.menu-bar",
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
        menuBarApp: { availability: "available" },
      }),
    );
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    const installLink = await vi.waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-role="connected-app-install-link"]',
      );
      expect(element).not.toBeNull();
      return element!;
    });
    const lifecycleButton = container.querySelector<HTMLElement>(
      '[data-role="connected-app-lifecycle-button"]',
    );

    expect(installLink.classList.contains("connected-app-action")).toBe(true);
    expect(lifecycleButton?.classList.contains("connected-app-action")).toBe(
      true,
    );
  });

  it("does not duplicate the first-party menu bar app after registration", async () => {
    const client = createClient(
      createSettings({
        enabled: true,
        connectors: [
          {
            id: "com.gormanity.ytm-enhancer.menu-bar",
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
        menuBarApp: { availability: "available" },
      }),
    );
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      expect(
        container.querySelectorAll(
          '[data-app-id="com.gormanity.ytm-enhancer.menu-bar"]',
        ).length,
      ).toBe(1);
    });
    expect(container.textContent).not.toContain("Registered Apps");

    const card = container.querySelector<HTMLDetailsElement>(
      '[data-app-id="com.gormanity.ytm-enhancer.menu-bar"]',
    );
    expect(card?.textContent).toContain("Uninstall...");
    expect(card?.textContent).toContain("Disable App");
    expect(
      card
        ?.querySelector<HTMLAnchorElement>(
          '[data-role="connected-app-install-link"]',
        )
        ?.href.endsWith("/menu-bar/install.html#uninstall"),
    ).toBe(true);
    expect(card?.textContent).toContain(
      "Open YTM Menu Bar from Applications to connect.",
    );
    expect(
      card?.querySelector(
        '[data-connector-id="com.gormanity.ytm-enhancer.menu-bar"]',
      ),
    ).not.toBeNull();
  });

  it("shows recovery guidance when the first-party native host is missing", async () => {
    const client = createClient(
      createSettings({
        enabled: true,
        connectors: [
          {
            id: "com.gormanity.ytm-enhancer.menu-bar",
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
        menuBarApp: {
          availability: "missing",
          lastError: "Specified native messaging host not found.",
        },
      }),
    );
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Not Installed");
      expect(container.textContent).toContain(
        "YTM Menu Bar or its native host was not detected.",
      );
      expect(container.textContent).toContain("Download for macOS");
      expect(container.textContent).toContain("Disable App");
    });
  });

  it("shows update guidance for incompatible first-party menu bar connectors", async () => {
    const client = createClient(
      createSettings({
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
      }),
    );
    const view = createConnectedAppsPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Update required");
      expect(container.textContent).toContain(
        "Open About YTM Menu Bar to download the update, or run brew upgrade --cask ytm-menu-bar.",
      );
    });
  });
});
