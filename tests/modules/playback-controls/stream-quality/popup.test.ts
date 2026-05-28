import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStreamQualityPopupView } from "@/modules/playback-controls/stream-quality/popup";
import { createTestModuleContext } from "../../../helpers/module-context";

describe("stream quality popup view", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;

  function createStreamQualityContext(quality: unknown = "2") {
    const getStreamQuality = vi.fn().mockResolvedValue(quality);
    const setStreamQuality = vi.fn().mockResolvedValue(undefined);
    return {
      context: createTestModuleContext({
        ytm: {
          getStreamQuality,
          setStreamQuality,
        },
      }),
      getStreamQuality,
      setStreamQuality,
    };
  }

  beforeEach(() => {
    sendMessageMock = vi.fn();

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
      },
    });
  });

  it("should return a popup view with correct metadata", () => {
    const view = createStreamQualityPopupView(createTestModuleContext());

    expect(view.id).toBe("stream-quality-settings");
    expect(view.label).toBe("Stream Quality");
  });

  it("should render a heading", () => {
    const view = createStreamQualityPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Audio Quality");
  });

  it("should render a disabled select with placeholder initially", () => {
    const view = createStreamQualityPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    expect(select?.disabled).toBe(true);
    expect(select?.options).toHaveLength(4);
    expect(select?.options[0].value).toBe("");
    expect(select?.options[0].textContent).toBe("—");
    expect(select?.options[1].value).toBe("1");
    expect(select?.options[1].textContent).toBe("Low");
    expect(select?.options[2].value).toBe("2");
    expect(select?.options[2].textContent).toBe("Normal");
    expect(select?.options[3].value).toBe("3");
    expect(select?.options[3].textContent).toBe("High");
  });

  it("should query current quality on render", () => {
    const { context, getStreamQuality } = createStreamQualityContext();
    const view = createStreamQualityPopupView(context);
    const container = document.createElement("div");

    view.render(container);

    expect(getStreamQuality).toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should select current quality and enable when response arrives", async () => {
    const { context } = createStreamQualityContext({
      current: "3",
    });
    const view = createStreamQualityPopupView(context);
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select?.disabled).toBe(false);
    });

    const select = container.querySelector<HTMLSelectElement>("select")!;
    expect(select.value).toBe("3");
  });

  it("should show the interaction hint until quality initializes", async () => {
    let resolveQuality: (quality: { current: string }) => void = () => {};
    const getStreamQuality = vi.fn(
      () =>
        new Promise<{ current: string }>((resolve) => {
          resolveQuality = resolve;
        }),
    );
    const context = createTestModuleContext({
      ytm: {
        getStreamQuality: getStreamQuality as unknown as () => Promise<
          string | null
        >,
      },
    });
    const view = createStreamQualityPopupView(context);
    const container = document.createElement("div");

    view.render(container);

    const hint = container.querySelector<HTMLElement>(
      '[data-role="stream-quality-hint"]',
    );
    expect(hint?.classList.contains("is-hidden")).toBe(false);

    resolveQuality({ current: "2" });

    await vi.waitFor(() => {
      expect(hint?.classList.contains("is-hidden")).toBe(true);
    });
  });

  it("should enable select even when current is null", async () => {
    const { context } = createStreamQualityContext({
      current: null,
    });
    const view = createStreamQualityPopupView(context);
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select?.disabled).toBe(false);
    });
  });

  it("should keep the interaction hint visible when quality is unavailable", async () => {
    const { context } = createStreamQualityContext({
      current: null,
    });
    const view = createStreamQualityPopupView(context);
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select?.disabled).toBe(false);
    });

    const hint = container.querySelector<HTMLElement>(
      '[data-role="stream-quality-hint"]',
    );
    expect(hint?.classList.contains("is-hidden")).toBe(false);
  });

  it("should send set-stream-quality on change", async () => {
    const { context, setStreamQuality } = createStreamQualityContext({
      current: "2",
    });
    const view = createStreamQualityPopupView(context);
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select?.disabled).toBe(false);
    });

    const select = container.querySelector<HTMLSelectElement>("select")!;
    select.value = "3";
    select.dispatchEvent(new Event("change"));

    expect(setStreamQuality).toHaveBeenCalledWith("3");
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should remain disabled when response is not ok", () => {
    const context = createTestModuleContext({
      ytm: {
        getStreamQuality: vi.fn().mockRejectedValue(new Error("No YTM tab")),
      },
    });
    const view = createStreamQualityPopupView(context);
    const container = document.createElement("div");

    view.render(container);

    const select = container.querySelector<HTMLSelectElement>("select");
    expect(select?.disabled).toBe(true);
  });
});
