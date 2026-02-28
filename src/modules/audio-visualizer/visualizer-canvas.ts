import { STYLE_RENDERERS, type VisualizerStyle } from "./styles";

export class VisualizerCanvas {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private container: HTMLElement | null = null;
  private animationId: number | null = null;
  private style: VisualizerStyle = "bars";
  private frequencyData: Uint8Array<ArrayBuffer> = new Uint8Array(0);

  attach(container: HTMLElement): void {
    this.container = container;

    const pos = container.style.position;
    if (!pos || pos === "static") {
      container.style.position = "relative";
    }

    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0px";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";

    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    container.appendChild(canvas);
  }

  setStyle(style: VisualizerStyle): void {
    this.style = style;
  }

  updateFrequencyData(data: Uint8Array<ArrayBuffer>): void {
    this.frequencyData = data;
  }

  start(): void {
    this.stop();
    this.tick();
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.clear();
  }

  private clear(): void {
    if (!this.canvas || !this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  destroy(): void {
    this.stop();
    if (this.canvas && this.container) {
      this.container.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.container = null;
  }

  private tick(): void {
    this.animationId = requestAnimationFrame(() => {
      this.draw();
      this.tick();
    });
  }

  private draw(): void {
    if (!this.canvas || !this.ctx) return;

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.canvas.width = width;
    this.canvas.height = height;

    const renderer = STYLE_RENDERERS[this.style];
    renderer({
      ctx: this.ctx,
      width,
      height,
      data: this.frequencyData,
    });
  }
}
