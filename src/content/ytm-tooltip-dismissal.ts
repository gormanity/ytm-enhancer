const YTM_TOOLTIP_SELECTOR = [
  "tp-yt-paper-tooltip",
  "paper-tooltip",
  "yt-tooltip-renderer",
  "ytmusic-player-tooltip",
  '[role="tooltip"]',
].join(",");

function isPlaybackTooltip(el: HTMLElement): boolean {
  return /\bstart playback\b/i.test(el.textContent ?? "");
}

function hideTooltip(el: HTMLElement): void {
  const tooltip = el as HTMLElement & {
    hide?: () => void;
    close?: () => void;
  };

  tooltip.hide?.();
  tooltip.close?.();
  el.setAttribute("aria-hidden", "true");
  el.removeAttribute("visible");
  el.removeAttribute("opened");
  el.classList.remove("visible", "shown", "showing", "active", "fade-in");
  el.style.display = "none";
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
}

export function dismissYtmTooltips(): void {
  const candidates =
    document.querySelectorAll<HTMLElement>(YTM_TOOLTIP_SELECTOR);
  for (const el of candidates) {
    if (isPlaybackTooltip(el)) {
      hideTooltip(el);
    }
  }
}

export function installYtmTooltipDismissal(): () => void {
  const dismiss = () => dismissYtmTooltips();

  document.addEventListener("pointerdown", dismiss, true);
  document.addEventListener("click", dismiss, true);
  document.addEventListener("play", dismiss, true);

  return () => {
    document.removeEventListener("pointerdown", dismiss, true);
    document.removeEventListener("click", dismiss, true);
    document.removeEventListener("play", dismiss, true);
  };
}
