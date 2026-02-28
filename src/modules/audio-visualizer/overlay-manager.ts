import type { VisualizerStyle } from "./styles";
import { VisualizerCanvas } from "./visualizer-canvas";

export class VisualizerOverlayManager {
  private playerBarCanvas: VisualizerCanvas | null = null;
  private songArtCanvas: VisualizerCanvas | null = null;
  private pipCanvas: VisualizerCanvas | null = null;
  private currentStyle: VisualizerStyle = "bars";
  private running = false;

  attachToPlayerBar(container: HTMLElement): void {
    this.playerBarCanvas = this.createAndAttach(container);
  }

  attachToSongArt(container: HTMLElement): void {
    this.songArtCanvas = this.createAndAttach(container);
  }

  attachToPip(container: HTMLElement): void {
    this.pipCanvas = this.createAndAttach(container);
  }

  detachPip(): void {
    this.pipCanvas?.destroy();
    this.pipCanvas = null;
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
    for (const canvas of this.allCanvases()) {
      canvas.start();
    }
  }

  stopAll(): void {
    this.running = false;
    for (const canvas of this.allCanvases()) {
      canvas.stop();
    }
  }

  destroyAll(): void {
    this.running = false;
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
    if (this.running) {
      canvas.start();
    }
    return canvas;
  }

  private allCanvases(): VisualizerCanvas[] {
    const result: VisualizerCanvas[] = [];
    if (this.playerBarCanvas) result.push(this.playerBarCanvas);
    if (this.songArtCanvas) result.push(this.songArtCanvas);
    if (this.pipCanvas) result.push(this.pipCanvas);
    return result;
  }
}
