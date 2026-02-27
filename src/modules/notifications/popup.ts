import type { PopupView } from "@/core/types";
import type { NotificationsModule } from "./index";

/** Create the notifications settings popup view. */
export function createNotificationsPopupView(
  module: NotificationsModule,
): PopupView {
  return {
    id: "notifications-settings",
    label: "Notifications",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Track Notifications";
      container.appendChild(heading);

      const label = document.createElement("label");
      label.className = "toggle-row";

      const text = document.createElement("span");
      text.textContent = "Show notifications on track change";
      label.appendChild(text);

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = module.isEnabled();
      toggle.addEventListener("change", () => {
        module.setEnabled(toggle.checked);
      });
      label.appendChild(toggle);

      container.appendChild(label);
    },
  };
}
