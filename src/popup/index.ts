import { createHotkeysPopupView } from "@/modules/hotkeys/popup";

const container = document.getElementById("view-container");
if (container) {
  const view = createHotkeysPopupView();
  view.render(container);
}
