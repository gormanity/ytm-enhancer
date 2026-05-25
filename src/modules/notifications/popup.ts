import type { NotificationFields } from "./index";
import type { ModuleContext, PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import {
  bindModuleActionButton,
  bindModuleCheckboxGroup,
  bindModuleToggle,
} from "@/popup/module-ui";
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
): PopupView {
  return {
    id: "notifications-settings",
    label: "Notifications",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      bindModuleToggle(container, "notifications-toggle", {
        get: () =>
          context.runtime.request<boolean>({
            type: "get-notifications-enabled",
          }),
        set: (enabled) =>
          context.runtime.command({
            type: "set-notifications-enabled",
            enabled,
          }),
      });
      bindModuleToggle(container, "notifications-unpause-toggle", {
        get: () =>
          context.runtime.request<boolean>({
            type: "get-notify-on-unpause",
          }),
        set: (enabled) =>
          context.runtime.command({
            type: "set-notify-on-unpause",
            enabled,
          }),
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
          get: () =>
            context.runtime.request<NotificationFields>({
              type: "get-notification-fields",
            }),
          set: (fields) =>
            context.runtime.command({
              type: "set-notification-fields",
              fields,
            }),
        },
      );

      // Preview section
      bindModuleActionButton(container, "notifications-preview-btn", () =>
        context.runtime.command({ type: "preview-notification" }),
      );
    },
  };
}
