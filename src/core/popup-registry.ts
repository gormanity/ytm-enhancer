import type { PopupView } from "./types";

/** Registry for popup views contributed by feature modules. */
export class PopupRegistry {
  private views = new Map<string, PopupView>();

  register(view: PopupView): void {
    if (this.views.has(view.id)) {
      throw new Error(`Popup view already registered: ${view.id}`);
    }
    this.views.set(view.id, view);
  }

  unregister(id: string): void {
    this.views.delete(id);
  }

  get(id: string): PopupView | undefined {
    return this.views.get(id);
  }

  getAll(): PopupView[] {
    return Array.from(this.views.values());
  }
}
