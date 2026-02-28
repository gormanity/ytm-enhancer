import type { VisualizerStyle, VisualizerTarget } from "./styles";
import { VisualizerCanvas } from "./visualizer-canvas";

export class VisualizerOverlayManager {
  private playerBarCanvas: VisualizerCanvas | null = null;
  private songArtCanvas: VisualizerCanvas | null = null;
  private pipCanvas: VisualizerCanvas | null = null;
  private currentStyle: VisualizerStyle = "bars";
  private running = false;
  private target: VisualizerTarget = "auto";

  private playerBarVisible = false;
  private songArtVisible = false;
  private pipVisible = false;

  private observer: IntersectionObserver | null = null;
  private observedContainers = new Map<
    HTMLElement,
    "playerBar" | "songArt" | "pip"
  >();

  attachToPlayerBar(container: HTMLElement): void {
    this.playerBarCanvas = this.createAndAttach(container);
    this.observeContainer(container, "playerBar");
    this.evaluateActive();
  }

  attachToSongArt(container: HTMLElement): void {
    this.songArtCanvas = this.createAndAttach(container);
    this.observeContainer(container, "songArt");
    this.evaluateActive();
  }

  attachToPip(container: HTMLElement): void {
    this.pipCanvas = this.createAndAttach(container);
    this.observeContainer(container, "pip");
    this.evaluateActive();
  }

  detachPip(): void {
    this.pipCanvas?.destroy();
    this.pipCanvas = null;
    this.pipVisible = false;
    this.unobserveSurface("pip");
    this.evaluateActive();
  }

  setTarget(target: VisualizerTarget): void {
    this.target = target;
    this.evaluateActive();
  }

  updateFrequencyData(data: Uint8Array<ArrayBuffer>): void {
    for (const canvas of this.allCanvases()) {
      canvas.updateFrequencyData(data);
    }
  }

  setStyle(style: VisualizerStyle): void {
    this.currentStyle = style;
    for (const canvas of this.allCanvases()) {
      canvas.setStyle(style);
    }
  }

  startAll(): void {
    this.running = true;
    this.ensureObserver();
    for (const [container] of this.observedContainers) {
      this.observer!.observe(container);
    }
    this.evaluateActive();
  }

  stopAll(): void {
    this.running = false;
    this.destroyObserver();
    for (const canvas of this.allCanvases()) {
      canvas.stop();
    }
  }

  destroyAll(): void {
    this.running = false;
    this.destroyObserver();
    this.observedContainers.clear();
    this.playerBarVisible = false;
    this.songArtVisible = false;
    this.pipVisible = false;
    for (const canvas of this.allCanvases()) {
      canvas.destroy();
    }
    this.playerBarCanvas = null;
    this.songArtCanvas = null;
    this.pipCanvas = null;
  }

  private createAndAttach(container: HTMLElement): VisualizerCanvas {
    const canvas = new VisualizerCanvas();
    canvas.attach(container);
    canvas.setStyle(this.currentStyle);
    return canvas;
  }

  private ensureObserver(): void {
    if (this.observer) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const surface = this.observedContainers.get(
            entry.target as HTMLElement,
          );
          if (!surface) continue;
          switch (surface) {
            case "playerBar":
              this.playerBarVisible = entry.isIntersecting;
              break;
            case "songArt":
              this.songArtVisible = entry.isIntersecting;
              break;
            case "pip":
              this.pipVisible = entry.isIntersecting;
              break;
          }
        }
        this.evaluateActive();
      },
      { threshold: 0 },
    );
  }

  private destroyObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private observeContainer(
    container: HTMLElement,
    surface: "playerBar" | "songArt" | "pip",
  ): void {
    this.observedContainers.set(container, surface);
    if (this.observer) {
      this.observer.observe(container);
    }
  }

  private unobserveSurface(surface: "playerBar" | "songArt" | "pip"): void {
    for (const [container, s] of this.observedContainers) {
      if (s === surface) {
        this.observer?.unobserve(container);
        this.observedContainers.delete(container);
        break;
      }
    }
  }

  private evaluateActive(): void {
    if (!this.running) return;

    const active = this.shouldBeActive();

    const entries: [VisualizerCanvas | null, boolean][] = [
      [this.playerBarCanvas, active.playerBar],
      [this.songArtCanvas, active.songArt],
      [this.pipCanvas, active.pip],
    ];

    for (const [canvas, shouldRun] of entries) {
      if (!canvas) continue;
      if (shouldRun) {
        canvas.start();
      } else {
        canvas.stop();
      }
    }
  }

  private shouldBeActive(): {
    playerBar: boolean;
    songArt: boolean;
    pip: boolean;
  } {
    switch (this.target) {
      case "all":
        return { playerBar: true, songArt: true, pip: true };
      case "pip-only":
        return { playerBar: false, songArt: false, pip: true };
      case "song-art-only":
        return { playerBar: false, songArt: true, pip: false };
      case "player-bar-only":
        return { playerBar: true, songArt: false, pip: false };
      case "auto": {
        if (this.pipCanvas && this.pipVisible)
          return { playerBar: false, songArt: false, pip: true };
        if (this.songArtCanvas && this.songArtVisible)
          return { playerBar: false, songArt: true, pip: false };
        if (this.playerBarCanvas && this.playerBarVisible)
          return { playerBar: true, songArt: false, pip: false };
        return { playerBar: false, songArt: false, pip: false };
      }
    }
  }

  private allCanvases(): VisualizerCanvas[] {
    const result: VisualizerCanvas[] = [];
    if (this.playerBarCanvas) result.push(this.playerBarCanvas);
    if (this.songArtCanvas) result.push(this.songArtCanvas);
    if (this.pipCanvas) result.push(this.pipCanvas);
    return result;
  }
}
