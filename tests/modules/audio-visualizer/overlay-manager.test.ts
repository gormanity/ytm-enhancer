import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { VisualizerOverlayManager } from "@/modules/audio-visualizer/overlay-manager";

interface MockCanvas {
  attach: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  setStyle: ReturnType<typeof vi.fn>;
  updateFrequencyData: ReturnType<typeof vi.fn>;
}

let mockCanvases: MockCanvas[];

vi.mock("@/modules/audio-visualizer/visualizer-canvas", () => {
  class MockVisualizerCanvas {
    attach = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    destroy = vi.fn();
    setStyle = vi.fn();
    updateFrequencyData = vi.fn();
    constructor() {
      mockCanvases.push(this as unknown as MockCanvas);
    }
  }
  return { VisualizerCanvas: MockVisualizerCanvas };
});

describe("VisualizerOverlayManager", () => {
  let manager: VisualizerOverlayManager;
  let ioCallback: IntersectionObserverCallback;
  let observeMock: Mock;
  let unobserveMock: Mock;
  let disconnectMock: Mock;

  function fireIntersection(
    entries: Array<{ target: HTMLElement; isIntersecting: boolean }>,
  ): void {
    ioCallback(
      entries.map(
        (e) =>
          ({
            target: e.target,
            isIntersecting: e.isIntersecting,
          }) as unknown as IntersectionObserverEntry,
      ),
      {} as IntersectionObserver,
    );
  }

  function makeAllVisible(...containers: HTMLElement[]): void {
    fireIntersection(
      containers.map((target) => ({ target, isIntersecting: true })),
    );
  }

  beforeEach(() => {
    mockCanvases = [];
    vi.clearAllMocks();

    observeMock = vi.fn();
    unobserveMock = vi.fn();
    disconnectMock = vi.fn();

    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          ioCallback = cb;
        }
        observe = observeMock;
        unobserve = unobserveMock;
        disconnect = disconnectMock;
      },
    );

    manager = new VisualizerOverlayManager();
  });

  afterEach(() => {
    manager.destroyAll();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("should attach a canvas to the player bar container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    manager.attachToPlayerBar(container);

    expect(mockCanvases).toHaveLength(1);
    expect(mockCanvases[0].attach).toHaveBeenCalledWith(container);
  });

  it("should attach a canvas to the song art container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    manager.attachToSongArt(container);

    expect(mockCanvases).toHaveLength(1);
    expect(mockCanvases[0].attach).toHaveBeenCalledWith(container);
  });

  it("should attach a canvas to PiP container", () => {
    const container = document.createElement("div");

    manager.attachToPip(container);

    expect(mockCanvases).toHaveLength(1);
    expect(mockCanvases[0].attach).toHaveBeenCalledWith(container);
  });

  it("should detach PiP canvas on detachPip", () => {
    const container = document.createElement("div");
    manager.attachToPip(container);
    manager.detachPip();

    expect(mockCanvases[0].destroy).toHaveBeenCalledTimes(1);
  });

  it("should fan out frequency data to all canvases", () => {
    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    document.body.appendChild(c1);
    document.body.appendChild(c2);

    manager.attachToPlayerBar(c1);
    manager.attachToSongArt(c2);

    const data = new Uint8Array([128, 64]);
    manager.updateFrequencyData(data);

    expect(mockCanvases[0].updateFrequencyData).toHaveBeenCalledWith(data);
    expect(mockCanvases[1].updateFrequencyData).toHaveBeenCalledWith(data);
  });

  it("should set style on all canvases", () => {
    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    document.body.appendChild(c1);
    document.body.appendChild(c2);

    manager.attachToPlayerBar(c1);
    manager.attachToSongArt(c2);

    mockCanvases[0].setStyle.mockClear();
    mockCanvases[1].setStyle.mockClear();
    manager.setStyle("waveform");

    expect(mockCanvases[0].setStyle).toHaveBeenCalledWith("waveform");
    expect(mockCanvases[1].setStyle).toHaveBeenCalledWith("waveform");
  });

  it("should start all canvases", () => {
    const c1 = document.createElement("div");
    document.body.appendChild(c1);

    manager.attachToPlayerBar(c1);
    manager.startAll();
    makeAllVisible(c1);

    expect(mockCanvases[0].start).toHaveBeenCalledTimes(1);
  });

  it("should stop all canvases", () => {
    const c1 = document.createElement("div");
    document.body.appendChild(c1);

    manager.attachToPlayerBar(c1);
    manager.stopAll();

    expect(mockCanvases[0].stop).toHaveBeenCalledTimes(1);
  });

  it("should destroy all canvases", () => {
    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    const c3 = document.createElement("div");
    document.body.appendChild(c1);
    document.body.appendChild(c2);

    manager.attachToPlayerBar(c1);
    manager.attachToSongArt(c2);
    manager.attachToPip(c3);
    manager.destroyAll();

    expect(mockCanvases[0].destroy).toHaveBeenCalledTimes(1);
    expect(mockCanvases[1].destroy).toHaveBeenCalledTimes(1);
    expect(mockCanvases[2].destroy).toHaveBeenCalledTimes(1);
  });

  it("should auto-start canvas when attached after startAll", () => {
    const c1 = document.createElement("div");
    document.body.appendChild(c1);
    manager.attachToPlayerBar(c1);
    manager.startAll();
    makeAllVisible(c1);

    const pipContainer = document.createElement("div");
    manager.attachToPip(pipContainer);
    makeAllVisible(pipContainer);

    expect(mockCanvases[1].start).toHaveBeenCalledTimes(1);
  });

  it("should not auto-start canvas when not running", () => {
    const pipContainer = document.createElement("div");
    manager.attachToPip(pipContainer);

    expect(mockCanvases[0].start).not.toHaveBeenCalled();
  });

  it("should not auto-start after stopAll", () => {
    const c1 = document.createElement("div");
    document.body.appendChild(c1);
    manager.attachToPlayerBar(c1);
    manager.startAll();
    manager.stopAll();

    const pipContainer = document.createElement("div");
    manager.attachToPip(pipContainer);

    expect(mockCanvases[1].start).not.toHaveBeenCalled();
  });

  it("should not auto-start after destroyAll", () => {
    const c1 = document.createElement("div");
    document.body.appendChild(c1);
    manager.attachToPlayerBar(c1);
    manager.startAll();
    manager.destroyAll();

    const pipContainer = document.createElement("div");
    manager.attachToPip(pipContainer);

    expect(mockCanvases[1].start).not.toHaveBeenCalled();
  });

  it("should apply current style to newly attached canvases", () => {
    manager.setStyle("circular");

    const c = document.createElement("div");
    document.body.appendChild(c);
    manager.attachToPlayerBar(c);

    expect(mockCanvases[0].setStyle).toHaveBeenCalledWith("circular");
  });

  describe("surface targeting", () => {
    let pb: HTMLElement;
    let sa: HTMLElement;
    let pip: HTMLElement;

    function attachAll(): void {
      pb = document.createElement("div");
      sa = document.createElement("div");
      pip = document.createElement("div");
      document.body.appendChild(pb);
      document.body.appendChild(sa);
      manager.attachToPlayerBar(pb);
      manager.attachToSongArt(sa);
      manager.attachToPip(pip);
    }

    it("should default to auto target", () => {
      attachAll();
      manager.startAll();
      makeAllVisible(pb, sa, pip);

      // auto: pip is highest priority when visible
      // canvas order: 0=playerBar, 1=songArt, 2=pip
      expect(mockCanvases[2].start).toHaveBeenCalled();
      expect(mockCanvases[0].stop).toHaveBeenCalled();
      expect(mockCanvases[1].stop).toHaveBeenCalled();
    });

    it("auto target should fall back to song art when no PiP", () => {
      const pbEl = document.createElement("div");
      const saEl = document.createElement("div");
      document.body.appendChild(pbEl);
      document.body.appendChild(saEl);
      manager.attachToPlayerBar(pbEl);
      manager.attachToSongArt(saEl);
      manager.startAll();
      makeAllVisible(pbEl, saEl);

      // canvas order: 0=playerBar, 1=songArt
      expect(mockCanvases[1].start).toHaveBeenCalled();
      expect(mockCanvases[0].stop).toHaveBeenCalled();
    });

    it("auto target should fall back to player bar when only that is attached", () => {
      const pbEl = document.createElement("div");
      document.body.appendChild(pbEl);
      manager.attachToPlayerBar(pbEl);
      manager.startAll();
      makeAllVisible(pbEl);

      expect(mockCanvases[0].start).toHaveBeenCalled();
    });

    it("auto target should re-evaluate when PiP detaches", () => {
      attachAll();
      manager.startAll();
      makeAllVisible(pb, sa, pip);

      // Clear to track re-evaluation
      for (const c of mockCanvases) {
        c.start.mockClear();
        c.stop.mockClear();
      }

      manager.detachPip();

      // Should fall back to songArt (index 1)
      expect(mockCanvases[1].start).toHaveBeenCalled();
      expect(mockCanvases[0].stop).toHaveBeenCalled();
    });

    it("all target should start all canvases", () => {
      manager.setTarget("all");
      attachAll();
      manager.startAll();

      expect(mockCanvases[0].start).toHaveBeenCalled();
      expect(mockCanvases[1].start).toHaveBeenCalled();
      expect(mockCanvases[2].start).toHaveBeenCalled();
    });

    it("pip-only target should start only PiP canvas", () => {
      manager.setTarget("pip-only");
      attachAll();
      manager.startAll();

      expect(mockCanvases[2].start).toHaveBeenCalled();
      expect(mockCanvases[0].stop).toHaveBeenCalled();
      expect(mockCanvases[1].stop).toHaveBeenCalled();
    });

    it("song-art-only target should start only song art canvas", () => {
      manager.setTarget("song-art-only");
      attachAll();
      manager.startAll();

      expect(mockCanvases[1].start).toHaveBeenCalled();
      expect(mockCanvases[0].stop).toHaveBeenCalled();
      expect(mockCanvases[2].stop).toHaveBeenCalled();
    });

    it("player-bar-only target should start only player bar canvas", () => {
      manager.setTarget("player-bar-only");
      attachAll();
      manager.startAll();

      expect(mockCanvases[0].start).toHaveBeenCalled();
      expect(mockCanvases[1].stop).toHaveBeenCalled();
      expect(mockCanvases[2].stop).toHaveBeenCalled();
    });

    it("setTarget should re-evaluate active surfaces", () => {
      manager.setTarget("all");
      attachAll();
      manager.startAll();

      for (const c of mockCanvases) {
        c.start.mockClear();
        c.stop.mockClear();
      }

      manager.setTarget("pip-only");

      expect(mockCanvases[2].start).toHaveBeenCalled();
      expect(mockCanvases[0].stop).toHaveBeenCalled();
      expect(mockCanvases[1].stop).toHaveBeenCalled();
    });

    it("auto target should re-evaluate when PiP attaches", () => {
      const pbEl = document.createElement("div");
      const saEl = document.createElement("div");
      document.body.appendChild(pbEl);
      document.body.appendChild(saEl);
      manager.attachToPlayerBar(pbEl);
      manager.attachToSongArt(saEl);
      manager.startAll();
      makeAllVisible(pbEl, saEl);

      // songArt should be active (highest without pip)
      expect(mockCanvases[1].start).toHaveBeenCalled();

      for (const c of mockCanvases) {
        c.start.mockClear();
        c.stop.mockClear();
      }

      const pipEl = document.createElement("div");
      manager.attachToPip(pipEl);
      makeAllVisible(pipEl);

      // Now pip (index 2) should be active, others stopped
      expect(mockCanvases[2].start).toHaveBeenCalled();
      expect(mockCanvases[1].stop).toHaveBeenCalled();
      expect(mockCanvases[0].stop).toHaveBeenCalled();
    });
  });

  describe("auto mode visibility tracking", () => {
    it("auto mode should activate song art only when it is visible", () => {
      const pb = document.createElement("div");
      const sa = document.createElement("div");
      document.body.appendChild(pb);
      document.body.appendChild(sa);
      manager.attachToPlayerBar(pb);
      manager.attachToSongArt(sa);
      manager.startAll();

      // Make only player bar visible
      fireIntersection([
        { target: pb, isIntersecting: true },
        { target: sa, isIntersecting: false },
      ]);

      for (const c of mockCanvases) {
        c.start.mockClear();
        c.stop.mockClear();
      }

      // Now make song art visible — it should take priority
      fireIntersection([{ target: sa, isIntersecting: true }]);

      expect(mockCanvases[1].start).toHaveBeenCalled();
      expect(mockCanvases[0].stop).toHaveBeenCalled();
    });

    it("auto mode should fall back to player bar when song art becomes hidden", () => {
      const pb = document.createElement("div");
      const sa = document.createElement("div");
      document.body.appendChild(pb);
      document.body.appendChild(sa);
      manager.attachToPlayerBar(pb);
      manager.attachToSongArt(sa);
      manager.startAll();

      // Both visible
      fireIntersection([
        { target: pb, isIntersecting: true },
        { target: sa, isIntersecting: true },
      ]);

      for (const c of mockCanvases) {
        c.start.mockClear();
        c.stop.mockClear();
      }

      // Song art goes away
      fireIntersection([{ target: sa, isIntersecting: false }]);

      expect(mockCanvases[0].start).toHaveBeenCalled();
      expect(mockCanvases[1].stop).toHaveBeenCalled();
    });

    it("auto mode should stop all when nothing is visible", () => {
      const pb = document.createElement("div");
      const sa = document.createElement("div");
      document.body.appendChild(pb);
      document.body.appendChild(sa);
      manager.attachToPlayerBar(pb);
      manager.attachToSongArt(sa);
      manager.startAll();

      fireIntersection([
        { target: pb, isIntersecting: false },
        { target: sa, isIntersecting: false },
      ]);

      expect(mockCanvases[0].stop).toHaveBeenCalled();
      expect(mockCanvases[1].stop).toHaveBeenCalled();
    });

    it("should observe containers when attached after startAll", () => {
      manager.startAll();

      const pb = document.createElement("div");
      document.body.appendChild(pb);
      manager.attachToPlayerBar(pb);

      expect(observeMock).toHaveBeenCalledWith(pb);
    });

    it("should disconnect observer on destroyAll", () => {
      const pb = document.createElement("div");
      document.body.appendChild(pb);
      manager.attachToPlayerBar(pb);
      manager.startAll();
      manager.destroyAll();

      expect(disconnectMock).toHaveBeenCalled();
    });

    it("should disconnect observer on stopAll", () => {
      const pb = document.createElement("div");
      document.body.appendChild(pb);
      manager.attachToPlayerBar(pb);
      manager.startAll();
      manager.stopAll();

      expect(disconnectMock).toHaveBeenCalled();
    });

    it("should unobserve PiP container on detachPip", () => {
      const pip = document.createElement("div");
      manager.startAll();
      manager.attachToPip(pip);
      manager.detachPip();

      expect(unobserveMock).toHaveBeenCalledWith(pip);
    });
  });
});
