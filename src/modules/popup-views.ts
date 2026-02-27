import type { PopupView } from "@/core/types";
import { createHotkeysPopupView } from "./hotkeys/popup";
import { createNotificationsPopupView } from "./notifications/popup";

/**
 * All popup views provided by feature modules.
 *
 * When adding a new module with a popup view, register its
 * factory here so it appears in the extension popup.
 */
export function getAllPopupViews(): PopupView[] {
  return [createHotkeysPopupView(), createNotificationsPopupView()];
}
