import type { PopupView } from "@/core/types";

export function createPrecisionVolumePopupView(): PopupView {
  return {
    id: "precision-volume-settings",
    label: "Precision Volume",
    render(_container: HTMLElement) {},
  };
}
