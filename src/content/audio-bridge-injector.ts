/**
 * Requests the background script to inject the audio bridge into the
 * page's main world via chrome.scripting.executeScript, then relays
 * frequency data back via window.postMessage.
 *
 * Direct DOM script injection (inline or external src) is blocked by
 * YTM's Content Security Policy. The chrome.scripting API bypasses
 * CSP because it is a privileged browser API.
 */
export class AudioBridgeInjector {
  private listener: ((event: MessageEvent) => void) | null = null;
  private injected = false;

  inject(callback: (data: Uint8Array<ArrayBuffer>) => void): void {
    if (this.injected) return;
    this.injected = true;

    chrome.runtime.sendMessage({ type: "inject-audio-bridge" });

    this.listener = (event: MessageEvent) => {
      const msg = event.data;
      if (
        !msg ||
        msg.type !== "ytm-enhancer:frequency-data" ||
        !Array.isArray(msg.data)
      ) {
        return;
      }
      callback(new Uint8Array(msg.data));
    };

    window.addEventListener("message", this.listener);
  }

  start(): void {
    window.postMessage(
      { type: "ytm-enhancer:audio-bridge-cmd", command: "start" },
      "*",
    );
  }

  stop(): void {
    window.postMessage(
      { type: "ytm-enhancer:audio-bridge-cmd", command: "stop" },
      "*",
    );
  }

  resume(): void {
    window.postMessage(
      { type: "ytm-enhancer:audio-bridge-cmd", command: "resume" },
      "*",
    );
  }

  destroy(): void {
    if (this.listener) {
      window.removeEventListener("message", this.listener);
      this.listener = null;
    }
    this.injected = false;
  }
}
