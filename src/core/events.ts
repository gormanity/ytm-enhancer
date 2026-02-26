type Listener<T = unknown> = (data: T) => void;

/** Simple typed event bus for inter-module communication. */
export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on<T = unknown>(event: string, listener: Listener<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener);
  }

  off<T = unknown>(event: string, listener: Listener<T>): void {
    this.listeners.get(event)?.delete(listener as Listener);
  }

  emit<T = unknown>(event: string, data: T): void {
    this.listeners.get(event)?.forEach((listener) => listener(data));
  }

  clear(): void {
    this.listeners.clear();
  }
}
