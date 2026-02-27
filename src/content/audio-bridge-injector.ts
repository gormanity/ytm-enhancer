/**
 * Injects the audio bridge script into the page's main world
 * and relays frequency data back to the content script.
 *
 * Uses an external script file (loaded via chrome.runtime.getURL)
 * to comply with the page's Content Security Policy, which blocks
 * inline scripts.
 */
export class AudioBridgeInjector {
  private listener: ((event: MessageEvent) => void) | null = null;
  private scriptEl: HTMLScriptElement | null = null;
  private injected = false;

  inject(callback: (data: Uint8Array<ArrayBuffer>) => void): void {
    if (this.injected) return;
    this.injected = true;

    const script = document.createElement("script");
    script.setAttribute("data-ytm-enhancer-audio-bridge", "");
    script.src = chrome.runtime.getURL("audio-bridge.js");
    document.documentElement.appendChild(script);
    this.scriptEl = script;

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
    if (this.scriptEl?.parentNode) {
      this.scriptEl.parentNode.removeChild(this.scriptEl);
      this.scriptEl = null;
    }
    this.injected = false;
  }
}
