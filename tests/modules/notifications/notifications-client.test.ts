import { describe, expect, it, vi } from "vitest";
import {
  createNotificationsClient,
  type NotificationFields,
} from "@/modules/notifications/client";
import type { RuntimeClient } from "@/core/messaging";

const fields: NotificationFields = {
  title: true,
  artist: true,
  album: false,
  year: false,
  artwork: true,
};

function createRuntime(): RuntimeClient {
  return {
    request: vi.fn().mockResolvedValue(true),
    command: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
  };
}

describe("NotificationsClient", () => {
  it("should read enabled state through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createNotificationsClient(runtime);

    await expect(client.isEnabled()).resolves.toBe(true);

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-notifications-enabled",
    });
  });

  it("should write enabled state through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createNotificationsClient(runtime);

    await client.setEnabled(false);

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-notifications-enabled",
      enabled: false,
    });
  });

  it("should read notify-on-unpause through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createNotificationsClient(runtime);

    await expect(client.getNotifyOnUnpause()).resolves.toBe(true);

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-notify-on-unpause",
    });
  });

  it("should write notify-on-unpause through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createNotificationsClient(runtime);

    await client.setNotifyOnUnpause(true);

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-notify-on-unpause",
      enabled: true,
    });
  });

  it("should read display fields through the runtime API", async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.request).mockResolvedValue(fields);
    const client = createNotificationsClient(runtime);

    await expect(client.getFields()).resolves.toEqual(fields);

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-notification-fields",
    });
  });

  it("should write display fields through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createNotificationsClient(runtime);

    await client.setFields(fields);

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-notification-fields",
      fields,
    });
  });

  it("should trigger previews through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createNotificationsClient(runtime);

    await client.preview();

    expect(runtime.command).toHaveBeenCalledWith({
      type: "preview-notification",
    });
  });
});
