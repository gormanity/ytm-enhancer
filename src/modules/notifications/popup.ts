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
  context?: ModuleContext,
): PopupView {
  return {
    id: "notifications-settings",
    label: "Notifications",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      bindModuleToggle(
        container,
        "notifications-toggle",
        context
          ? {
              get: () =>
                context.runtime.request<boolean>({
                  type: "get-notifications-enabled",
                }),
              set: (enabled) =>
                context.runtime.command({
                  type: "set-notifications-enabled",
                  enabled,
                }),
            }
          : {
              getType: "get-notifications-enabled",
              setType: "set-notifications-enabled",
            },
      );
      bindModuleToggle(
        container,
        "notifications-unpause-toggle",
        context
          ? {
              get: () =>
                context.runtime.request<boolean>({
                  type: "get-notify-on-unpause",
                }),
              set: (enabled) =>
                context.runtime.command({
                  type: "set-notify-on-unpause",
                  enabled,
                }),
            }
          : {
              getType: "get-notify-on-unpause",
              setType: "set-notify-on-unpause",
            },
      );

      // Firefox doesn't support the WebExtensions `silent` notification
      // option, so expose OS-level sound guidance only there.
      if (typeof chrome.commands.update === "function") {
        container
          .querySelector<HTMLElement>('[data-role="notifications-firefox-tip"]')
          ?.classList.remove("is-hidden");
      }

      const previewBtn = container.querySelector<HTMLButtonElement>(
        '[data-role="notifications-preview-btn"]',
      );
      if (!previewBtn) return;

      // Display fields section
      const fieldCheckboxes: {
        key: keyof NotificationFields;
        input: HTMLInputElement;
      }[] = [];

      for (const key of FIELD_KEYS) {
        const input = container.querySelector<HTMLInputElement>(
          `[data-role="notifications-field-${key}"]`,
        );
        if (!input) continue;
        input.disabled = true;
        fieldCheckboxes.push({ key, input });
      }

      if (context) {
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
      } else {
        chrome.runtime.sendMessage(
          { type: "get-notification-fields" },
          (response: { ok: boolean; data?: NotificationFields }) => {
            if (response?.ok && response.data) {
              for (const { key, input } of fieldCheckboxes) {
                input.checked = response.data[key];
                input.disabled = false;
              }
            }
          },
        );

        for (const { input } of fieldCheckboxes) {
          input.addEventListener("change", () => {
            const fields = {} as NotificationFields;
            for (const { key, input: cb } of fieldCheckboxes) {
              fields[key] = cb.checked;
            }
            chrome.runtime.sendMessage({
              type: "set-notification-fields",
              fields,
            });
          });
        }
      }

      // Preview section
      if (context) {
        bindModuleActionButton(container, "notifications-preview-btn", () =>
          context.runtime.command({ type: "preview-notification" }),
        );
      } else {
        previewBtn.onclick = () => {
          chrome.runtime.sendMessage({ type: "preview-notification" });
        };
      }
    },
  };
}
