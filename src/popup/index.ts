import { getAllPopupViews } from "@/modules/popup-views";

const container = document.getElementById("view-container");
const navList = document.getElementById("nav-list");

const views = getAllPopupViews();
let activeViewId = localStorage.getItem("active-view-id") || views[0]?.id;

function renderNav() {
  if (!navList) return;
  navList.innerHTML = "";

  for (const view of views) {
    const item = document.createElement("div");
    item.className = `nav-item ${view.id === activeViewId ? "active" : ""}`;
    item.innerHTML = `
      ${view.icon || ""}
      <span>${view.label}</span>
    `;
    item.onclick = () => switchView(view.id);
    navList.appendChild(item);
  }
}

function switchView(viewId: string) {
  activeViewId = viewId;
  localStorage.setItem("active-view-id", viewId);
  renderNav();
  renderActiveView();
}

function renderActiveView() {
  if (!container) return;
  container.innerHTML = "";

  const view = views.find((v) => v.id === activeViewId) || views[0];
  if (view) {
    const section = document.createElement("section");
    view.render(section);
    container.appendChild(section);
  }
}

if (container && navList) {
  renderNav();
  renderActiveView();
}
