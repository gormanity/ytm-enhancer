import type { RuntimeClient } from "@/core/messaging";
import type { NotificationFields } from "./index";

export type { NotificationFields };

export interface NotificationsClient {
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
  getNotifyOnUnpause(): Promise<boolean>;
  setNotifyOnUnpause(enabled: boolean): Promise<void>;
  getFields(): Promise<NotificationFields>;
  setFields(fields: NotificationFields): Promise<void>;
  preview(): Promise<void>;
}

export function createNotificationsClient(
  runtime: RuntimeClient,
): NotificationsClient {
  return {
    isEnabled: () =>
      runtime.request<boolean>({
        type: "get-notifications-enabled",
      }),
    setEnabled: (enabled) =>
      runtime.command({
        type: "set-notifications-enabled",
        enabled,
      }),
    getNotifyOnUnpause: () =>
      runtime.request<boolean>({
        type: "get-notify-on-unpause",
      }),
    setNotifyOnUnpause: (enabled) =>
      runtime.command({
        type: "set-notify-on-unpause",
        enabled,
      }),
    getFields: () =>
      runtime.request<NotificationFields>({
        type: "get-notification-fields",
      }),
    setFields: (fields) =>
      runtime.command({
        type: "set-notification-fields",
        fields,
      }),
    preview: () => runtime.command({ type: "preview-notification" }),
  };
}
