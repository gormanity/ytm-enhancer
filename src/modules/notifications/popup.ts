import type { NotificationFields } from "./index";
import type { ModuleContext, PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import {
  bindModuleActionButton,
  bindModuleCheckboxGroup,
  bindModuleToggle,
} from "@/popup/module-ui";
import { createNotificationsClient, type NotificationsClient } from "./client";
import templateHtml from "./popup.html?raw";

const FIELD_KEYS: Array<keyof NotificationFields> = [
  "title",
  "artist",
  "album",
  "year",
  "artwork",
];

/** Create the notifications settings popup view. */
export function createNotificationsPopupView(
  context: ModuleContext,
  client: NotificationsClient = createNotificationsClient(context.runtime),
): PopupView {
  return {
    id: "notifications-settings",
    label: "Notifications",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      bindModuleToggle(container, "notifications-toggle", {
        get: () => client.isEnabled(),
        set: (enabled) => client.setEnabled(enabled),
      });
      bindModuleToggle(container, "notifications-unpause-toggle", {
        get: () => client.getNotifyOnUnpause(),
        set: (enabled) => client.setNotifyOnUnpause(enabled),
      });

      // Firefox doesn't support the WebExtensions `silent` notification
      // option, so expose OS-level sound guidance only there.
      if (context.capabilities.runtime === "firefox") {
        container
          .querySelector<HTMLElement>('[data-role="notifications-firefox-tip"]')
          ?.classList.remove("is-hidden");
      }

      const previewBtn = container.querySelector<HTMLButtonElement>(
        '[data-role="notifications-preview-btn"]',
      );
      if (!previewBtn) return;

      // Display fields section
      bindModuleCheckboxGroup<NotificationFields>(
        container,
        Object.fromEntries(
          FIELD_KEYS.map((key) => [key, `notifications-field-${key}`]),
        ) as Record<keyof NotificationFields, string>,
        {
          get: () => client.getFields(),
          set: (fields) => client.setFields(fields),
        },
      );

      // Preview section
      bindModuleActionButton(container, "notifications-preview-btn", () =>
        client.preview(),
      );
    },
  };
}
