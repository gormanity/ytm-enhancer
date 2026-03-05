import type { PopupView, PlaybackState } from "@/core/types";
import { createPlaybackSpeedPopupView } from "../playback-speed/popup";
import { createStreamQualityPopupView } from "../stream-quality/popup";

interface YtmTabSummary {
  id: number | null;
  title: string;
  artworkUrl: string | null;
  favIconUrl: string | null;
  isSelected: boolean;
}

/** Create the combined Quick Settings popup view. */
export function createQuickSettingsPopupView(): PopupView {
  return {
    id: "quick-settings",
    label: "Quick Settings",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Quick Settings";
      container.appendChild(heading);

      // 1. Open Tabs Card
      const tabsCard = document.createElement("div");
      tabsCard.className = "settings-card";
      tabsCard.style.display = "none";
      container.appendChild(tabsCard);
      renderOpenTabs(tabsCard);

      // 2. Now Playing Card
      const nowPlayingCard = document.createElement("div");
      nowPlayingCard.className = "settings-card";
      container.appendChild(nowPlayingCard);
      renderCompactNowPlaying(nowPlayingCard);

      // 3. Audio & Playback Group
      const audioGroup = document.createElement("div");
      audioGroup.className = "settings-card";
      container.appendChild(audioGroup);

      const audioHeading = document.createElement("h3");
      audioHeading.textContent = "Audio & Playback";
      audioGroup.appendChild(audioHeading);

      // Volume Section (Integrated and Restyled)
      const volumeSection = document.createElement("div");
      volumeSection.className = "volume-group";
      audioGroup.appendChild(volumeSection);
      renderIntegratedVolume(volumeSection);

      // Speed & Quality Row
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "12px";
      row.style.marginTop = "16px";
      audioGroup.appendChild(row);

      // Speed
      const speedContainer = document.createElement("div");
      speedContainer.className = "compact-select-group";
      const speedView = createPlaybackSpeedPopupView();
      const speedContent = document.createElement("div");
      speedView.render(speedContent);
      speedContent.querySelector("h2")?.remove();
      // Style the label to be smaller
      const speedLabel = speedContent.querySelector(".toggle-row span");
      if (speedLabel) (speedLabel as HTMLElement).style.fontSize = "12px";

      speedContainer.appendChild(speedContent);
      row.appendChild(speedContainer);

      // Quality
      const qualityContainer = document.createElement("div");
      qualityContainer.className = "compact-select-group";
      const qualityView = createStreamQualityPopupView();
      const qualityContent = document.createElement("div");
      qualityView.render(qualityContent);
      qualityContent.querySelector("h2")?.remove();
      const qualityLabel = qualityContent.querySelector(".toggle-row span");
      if (qualityLabel) (qualityLabel as HTMLElement).style.fontSize = "12px";

      qualityContainer.appendChild(qualityContent);
      row.appendChild(qualityContainer);
    },
  };
}

function renderOpenTabs(container: HTMLElement) {
  const heading = document.createElement("h3");
  heading.textContent = "Music Source";
  container.appendChild(heading);

  const list = document.createElement("div");
  list.className = "tab-list-horizontal";
  container.appendChild(list);

  const renderTabs = (tabs: YtmTabSummary[]) => {
    list.innerHTML = "";

    for (const tab of tabs) {
      const item = document.createElement("div");
      item.className = "tab-item";
      if (tab.isSelected) item.classList.add("selected");

      const icon = document.createElement("img");
      icon.src = tab.artworkUrl ?? tab.favIconUrl ?? "icon48.png";
      icon.alt = "";
      icon.onerror = () => {
        icon.src = "icon48.png";
      };

      item.title = tab.title.replace(" - YouTube Music", "");
      item.onclick = () => {
        if (tab.id === null) return;
        chrome.runtime.sendMessage({ type: "set-selected-tab", tabId: tab.id });
        updateTabs();
      };
      item.ondblclick = () => {
        if (tab.id === null) return;
        chrome.runtime.sendMessage({ type: "focus-ytm-tab", tabId: tab.id });
      };

      item.appendChild(icon);
      list.appendChild(item);
    }
  };

  const updateTabs = () => {
    chrome.runtime.sendMessage({ type: "get-ytm-tabs" }, (response) => {
      const tabs = (response?.ok ? response.data?.tabs : []) as YtmTabSummary[];
      if (!Array.isArray(tabs) || tabs.length <= 1) {
        container.style.display = "none";
        return;
      }

      container.style.display = "block";
      renderTabs(tabs);
    });
  };

  updateTabs();
  setInterval(updateTabs, 3000);
}

/** Helper to update the red foreground fill on range inputs */
function updateSliderBackground(range: HTMLInputElement) {
  const percent = Number(range.value);
  range.style.background = `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${percent}%, #3f3f3f ${percent}%, #3f3f3f 100%)`;
}

/** Renders a specifically styled volume control that associates the slider and input */
function renderIntegratedVolume(container: HTMLElement) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "8px";
  container.appendChild(wrapper);

  const labelRow = document.createElement("div");
  labelRow.style.display = "flex";
  labelRow.style.justifyContent = "space-between";
  labelRow.style.alignItems = "center";
  wrapper.appendChild(labelRow);

  const label = document.createElement("span");
  label.textContent = "Volume";
  label.style.fontSize = "12px";
  label.style.color = "var(--text-secondary)";
  labelRow.appendChild(label);

  const inputGroup = document.createElement("div");
  inputGroup.style.display = "flex";
  inputGroup.style.alignItems = "center";
  inputGroup.style.gap = "4px";
  labelRow.appendChild(inputGroup);

  const numberInput = document.createElement("input");
  numberInput.type = "number";
  numberInput.min = "0";
  numberInput.max = "100";
  numberInput.className = "volume-number-input";
  numberInput.disabled = true;
  numberInput.value = ""; // Start empty
  inputGroup.appendChild(numberInput);

  const placeholder = document.createElement("span");
  placeholder.textContent = "—";
  placeholder.style.fontSize = "14px";
  placeholder.style.fontWeight = "600";
  placeholder.style.color = "var(--text-color)";
  inputGroup.appendChild(placeholder);

  const percent = document.createElement("span");
  percent.textContent = "%";
  percent.style.fontSize = "12px";
  percent.style.color = "var(--text-secondary)";
  inputGroup.appendChild(percent);

  const range = document.createElement("input");
  range.type = "range";
  range.min = "0";
  range.max = "100";
  range.value = "0"; // Start at 0 (empty fill)
  range.disabled = true;
  wrapper.appendChild(range);
  updateSliderBackground(range);

  chrome.runtime.sendMessage(
    { type: "get-volume" },
    (response: { ok: boolean; data?: number } | null) => {
      if (response?.ok) {
        const vol = Math.round((response.data ?? 1) * 100);
        range.value = String(vol);
        numberInput.value = String(vol);
        range.disabled = false;
        numberInput.disabled = false;
        placeholder.remove(); // Remove placeholder once loaded
        updateSliderBackground(range);
      }
    },
  );

  const updateVol = (val: number) => {
    chrome.runtime.sendMessage({ type: "set-volume", volume: val / 100 });
  };

  range.addEventListener("input", () => {
    numberInput.value = range.value;
    updateVol(Number(range.value));
    updateSliderBackground(range);
  });

  numberInput.addEventListener("change", () => {
    const val = Math.max(0, Math.min(100, Number(numberInput.value)));
    numberInput.value = String(val);
    range.value = String(val);
    updateVol(val);
    updateSliderBackground(range);
  });
}

function renderCompactNowPlaying(container: HTMLElement) {
  const trackInfo = document.createElement("div");
  trackInfo.style.display = "flex";
  trackInfo.style.gap = "16px";
  trackInfo.style.alignItems = "center";
  container.appendChild(trackInfo);

  const artwork = document.createElement("img");
  artwork.style.width = "64px";
  artwork.style.height = "64px";
  artwork.style.borderRadius = "4px";
  artwork.style.objectFit = "cover";
  artwork.style.background = "#1a1a1a";
  artwork.style.display = "none";
  trackInfo.appendChild(artwork);

  const meta = document.createElement("div");
  meta.style.flex = "1";
  meta.style.minWidth = "0";
  trackInfo.appendChild(meta);

  const title = document.createElement("div");
  title.style.fontSize = "15px";
  title.style.fontWeight = "600";
  title.style.whiteSpace = "nowrap";
  title.style.overflow = "hidden";
  title.style.textOverflow = "ellipsis";
  meta.appendChild(title);

  const artist = document.createElement("div");
  artist.style.fontSize = "12px";
  artist.style.color = "var(--text-secondary)";
  artist.style.marginTop = "2px";
  artist.style.whiteSpace = "nowrap";
  artist.style.overflow = "hidden";
  artist.style.textOverflow = "ellipsis";
  meta.appendChild(artist);

  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.gap = "12px";
  controls.style.marginTop = "8px";
  controls.style.alignItems = "center";
  meta.appendChild(controls);

  const createBtn = (svg: string, action: string, isSmall = true) => {
    const btn = document.createElement("button");
    btn.innerHTML = svg;
    btn.className = "icon-btn";
    if (!isSmall) btn.style.padding = "6px";
    btn.onclick = () =>
      chrome.runtime.sendMessage({ type: "playback-action", action });
    return btn;
  };

  const prevBtn = createBtn(
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>`,
    "previous",
  );
  const playBtn = createBtn(
    `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
    "togglePlay",
    false,
  );
  const nextBtn = createBtn(
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`,
    "next",
  );

  controls.appendChild(prevBtn);
  controls.appendChild(playBtn);
  controls.appendChild(nextBtn);

  const update = () => {
    chrome.runtime.sendMessage(
      { type: "get-playback-state" },
      (
        response: { ok: boolean; data?: PlaybackState; error?: string } | null,
      ) => {
        if (response?.ok && response.data) {
          const state = response.data;
          if (state.artworkUrl) {
            artwork.src = state.artworkUrl;
            artwork.style.display = "block";
          } else {
            artwork.style.display = "none";
          }
          title.textContent = state.title || "Unknown Track";
          artist.textContent = state.artist || "Unknown Artist";
          controls.style.display = "flex";

          if (state.isPlaying) {
            playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
          } else {
            playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
          }
        } else {
          artwork.style.display = "none";
          controls.style.display = "none";
          if (response?.error === "No YTM tab") {
            title.textContent = "YouTube Music not found";
            artist.textContent = "Open YTM to get started";
          } else {
            title.textContent = "No music playing";
            artist.textContent = "Waiting for playback...";
          }
        }
      },
    );
  };

  update();
  setInterval(update, 1000);
}
