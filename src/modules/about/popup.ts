import type { PopupView } from "@/core/types";

/** Create the About popup view. */
export function createAboutPopupView(): PopupView {
  return {
    id: "about",
    label: "About",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "About";
      container.appendChild(heading);

      // Version Card
      const versionCard = document.createElement("div");
      versionCard.className = "settings-card about-version-row";
      container.appendChild(versionCard);

      const nameLabel = document.createElement("span");
      nameLabel.textContent = "YTM Enhancer";
      nameLabel.className = "about-name-label";
      versionCard.appendChild(nameLabel);

      const versionLabel = document.createElement("span");
      versionLabel.textContent = "v0.1.0";
      versionLabel.className = "version-label version-label--strong";
      versionCard.appendChild(versionLabel);

      // Links Card
      const linksCard = document.createElement("div");
      linksCard.className = "settings-card";
      container.appendChild(linksCard);

      const linksHeading = document.createElement("h3");
      linksHeading.textContent = "Resources";
      linksCard.appendChild(linksHeading);

      const githubLink = createLinkRow(
        `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>`,
        "GitHub Repository",
        "https://github.com/jmgorman/ytm-enhancer",
      );
      linksCard.appendChild(githubLink);

      const supportLink = createLinkRow(
        `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
        "Report an Issue",
        "https://github.com/jmgorman/ytm-enhancer/issues",
      );
      linksCard.appendChild(supportLink);

      // MIT License section
      const licenseNote = document.createElement("div");
      licenseNote.className = "status-hint about-license-note";
      licenseNote.appendChild(
        document.createTextNode(
          "This extension is provided as open source under the ",
        ),
      );
      const mitLabel = document.createElement("strong");
      mitLabel.textContent = "MIT License";
      licenseNote.appendChild(mitLabel);
      licenseNote.appendChild(document.createTextNode("."));
      linksCard.appendChild(licenseNote);

      // Store Links Card (Future)
      const storeCard = document.createElement("div");
      storeCard.className = "settings-card";
      container.appendChild(storeCard);

      const storeHeading = document.createElement("h3");
      storeHeading.textContent = "Extensions Stores";
      storeCard.appendChild(storeHeading);

      const chromePlaceholder = document.createElement("div");
      chromePlaceholder.className = "toggle-row about-placeholder-row";
      chromePlaceholder.appendChild(
        createStorePlaceholderLabel("Chrome Web Store"),
      );
      chromePlaceholder.appendChild(createComingSoonLabel());
      storeCard.appendChild(chromePlaceholder);

      const firefoxPlaceholder = document.createElement("div");
      firefoxPlaceholder.className = "toggle-row about-placeholder-row";
      firefoxPlaceholder.appendChild(
        createStorePlaceholderLabel("Firefox Add-ons"),
      );
      firefoxPlaceholder.appendChild(createComingSoonLabel());
      storeCard.appendChild(firefoxPlaceholder);
    },
  };
}

function createStorePlaceholderLabel(text: string): HTMLElement {
  const label = document.createElement("span");
  label.textContent = text;
  return label;
}

function createComingSoonLabel(): HTMLElement {
  const status = document.createElement("span");
  status.className = "about-coming-soon";
  status.textContent = "Coming soon";
  return status;
}

function createLinkRow(svg: string, label: string, url: string): HTMLElement {
  const row = document.createElement("a");
  row.href = url;
  row.target = "_blank";
  row.className = "toggle-row about-link-row";

  const content = document.createElement("div");
  content.className = "about-link-content";

  const icon = document.createElement("div");
  icon.innerHTML = svg;
  icon.className = "about-link-icon";

  const text = document.createElement("span");
  text.textContent = label;

  content.appendChild(icon);
  content.appendChild(text);
  row.appendChild(content);

  const arrow = document.createElement("span");
  arrow.className = "about-link-arrow";
  arrow.textContent = "→";
  row.appendChild(arrow);

  return row;
}
