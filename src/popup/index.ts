import { createHotkeysPopupView } from "@/modules/hotkeys/popup";
import { createNotificationsPopupView } from "@/modules/notifications/popup";

const container = document.getElementById("view-container");
if (container) {
  const views = [createHotkeysPopupView(), createNotificationsPopupView()];
  for (const view of views) {
    const section = document.createElement("section");
    view.render(section);
    container.appendChild(section);
  }
}
