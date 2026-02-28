/**
 * Requests the background script to inject the quality bridge into the
 * page's main world via chrome.scripting.executeScript, then relays
 * quality data back via window.postMessage.
 *
 * YTM audio quality uses a native settings API on the ytmusic-app
 * element (handleSetClientSettingEndpoint) rather than the player's
 * quality API (which only returns "auto").
 *
 * Quality values: "1" = Low, "2" = Normal, "3" = High.
 */

export interface QualityData {
  /** Current quality value ("1", "2", "3") or null if unavailable. */
  current: string | null;
}

export class QualityBridgeInjector {
  private listener: ((event: MessageEvent) => void) | null = null;
  private injected = false;
  private pendingResolve: ((data: QualityData) => void) | null = null;

  async inject(): Promise<void> {
    if (this.injected) return;
    this.injected = true;

    this.listener = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || msg.type !== "ytm-enhancer:quality-data") return;

      const data: QualityData = {
        current: typeof msg.current === "string" ? msg.current : null,
      };

      if (this.pendingResolve) {
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        resolve(data);
      }
    };

    window.addEventListener("message", this.listener);

    await new Promise<void>((resolve, reject) => {
      (
        chrome.runtime.sendMessage as (
          message: unknown,
          callback: (response: { ok: boolean; error?: string }) => void,
        ) => void
      )({ type: "inject-quality-bridge" }, (response) => {
        if (response?.ok) {
          resolve();
        } else {
          reject(
            new Error(
              response?.error ?? "Failed to inject quality bridge script",
            ),
          );
        }
      });
    });
  }

  getQuality(): Promise<QualityData> {
    return new Promise<QualityData>((resolve) => {
      this.pendingResolve = resolve;
      window.postMessage(
        { type: "ytm-enhancer:quality-bridge-cmd", command: "get-quality" },
        "*",
      );
    });
  }

  setQuality(value: string): void {
    window.postMessage(
      {
        type: "ytm-enhancer:quality-bridge-cmd",
        command: "set-quality",
        value,
      },
      "*",
    );
  }

  destroy(): void {
    if (this.listener) {
      window.removeEventListener("message", this.listener);
      this.listener = null;
    }
    this.pendingResolve = null;
    this.injected = false;
  }
}
