import { getAllPopupViews } from "@/modules/popup-views";

const container = document.getElementById("view-container");
if (container) {
  for (const view of getAllPopupViews()) {
    const section = document.createElement("section");
    view.render(section);
    container.appendChild(section);
  }
}
