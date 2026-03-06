import { getAllPopupViews } from "@/modules/popup-views";

const container = document.getElementById("view-container");
const navList = document.getElementById("nav-list");
const navItemTemplate = document.getElementById(
  "nav-item-template",
) as HTMLTemplateElement | null;

const views = getAllPopupViews();
let activeViewId = localStorage.getItem("active-view-id") || views[0]?.id;
let activeViewCleanup: (() => void) | null = null;

function renderNav() {
  if (!navList) return;
  navList.innerHTML = "";

  for (const view of views) {
    const item = createNavItem(view.id, view.label, view.icon);
    if (!item) continue;
    item.classList.toggle("active", view.id === activeViewId);
    item.onclick = () => switchView(view.id);
    navList.appendChild(item);
  }
}

function createNavItem(
  id: string,
  label: string,
  icon?: string,
): HTMLDivElement | null {
  if (!navItemTemplate) return null;

  const fragment = navItemTemplate.content.cloneNode(true);
  const item =
    fragment.firstElementChild instanceof HTMLDivElement
      ? fragment.firstElementChild
      : null;
  if (!item) return null;

  const labelElement = item.querySelector<HTMLElement>('[data-role="label"]');
  if (labelElement) {
    labelElement.textContent = label;
  }

  const iconElement = item.querySelector<HTMLElement>('[data-role="icon"]');
  if (iconElement) {
    if (icon) {
      iconElement.innerHTML = icon;
    } else {
      iconElement.remove();
    }
  }

  item.dataset.viewId = id;
  return item;
}

function switchView(viewId: string) {
  activeViewId = viewId;
  localStorage.setItem("active-view-id", viewId);
  renderNav();
  renderActiveView();
}

function renderActiveView() {
  if (!container) return;
  activeViewCleanup?.();
  activeViewCleanup = null;
  container.innerHTML = "";

  const view = views.find((v) => v.id === activeViewId) || views[0];
  if (view) {
    const section = document.createElement("section");
    const cleanup = view.render(section);
    if (typeof cleanup === "function") {
      activeViewCleanup = cleanup;
    }
    container.appendChild(section);
  }
}

if (container && navList) {
  renderNav();
  renderActiveView();
}
