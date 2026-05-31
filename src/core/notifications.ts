export interface NotificationOptions {
  type: "basic";
  title: string;
  message: string;
  iconUrl: string;
  silent?: boolean;
}

export interface NotificationClient {
  create(options: NotificationOptions): Promise<string | null>;
  create(id: string, options: NotificationOptions): Promise<string | null>;
  clear(id: string): Promise<boolean>;
}

export type NotificationClickHandler = (
  notificationId: string,
) => void | Promise<void>;

export interface NotificationClickHandlerRegistry {
  register(id: string, handler: NotificationClickHandler): void;
}

export class NotificationClickRegistry implements NotificationClickHandlerRegistry {
  private handlers = new Map<string, NotificationClickHandler>();

  register(id: string, handler: NotificationClickHandler): void {
    this.handlers.set(id, handler);
  }

  async dispatch(id: string): Promise<boolean> {
    const handler = this.handlers.get(id);
    if (!handler) return false;

    await handler(id);
    return true;
  }
}

interface BrowserNotificationsApi {
  create(
    id: string,
    options: NotificationOptions,
    callback?: (id: string) => void,
  ): void | Promise<string>;
  create(
    options: NotificationOptions,
    callback?: (id: string) => void,
  ): void | Promise<string>;
  clear(
    id: string,
    callback?: (wasCleared: boolean) => void,
  ): void | Promise<boolean>;
}

function getRuntimeLastError(): Error | null {
  if (
    typeof chrome === "undefined" ||
    typeof chrome.runtime?.lastError?.message !== "string"
  ) {
    return null;
  }

  return new Error(chrome.runtime.lastError.message);
}

function getBrowserNotificationsApi(): BrowserNotificationsApi | null {
  if (
    typeof chrome === "undefined" ||
    typeof chrome.notifications?.create !== "function" ||
    typeof chrome.notifications?.clear !== "function"
  ) {
    return null;
  }

  return chrome.notifications as unknown as BrowserNotificationsApi;
}

export function createNotificationClient(
  notificationsApi: BrowserNotificationsApi | null = getBrowserNotificationsApi(),
): NotificationClient {
  return {
    create(
      idOrOptions: string | NotificationOptions,
      maybeOptions?: NotificationOptions,
    ): Promise<string | null> {
      if (!notificationsApi) return Promise.resolve(null);

      return new Promise((resolve, reject) => {
        let settled = false;
        const settle = (value: string | null): void => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const fail = (err: unknown): void => {
          if (settled) return;
          settled = true;
          reject(err);
        };
        const callback = (createdId: string): void => {
          const lastError = getRuntimeLastError();
          if (lastError) {
            fail(lastError);
            return;
          }
          settle(createdId);
        };

        try {
          const result =
            typeof idOrOptions === "string"
              ? notificationsApi.create(idOrOptions, maybeOptions!, callback)
              : notificationsApi.create(idOrOptions, callback);
          if (result && typeof result.then === "function") {
            result.then((id) => settle(id ?? null)).catch(fail);
          }
        } catch (err) {
          fail(err);
        }
      });
    },

    clear(id) {
      if (!notificationsApi) return Promise.resolve(false);

      return new Promise((resolve, reject) => {
        let settled = false;
        const settle = (value: boolean): void => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        try {
          const result = notificationsApi.clear(id, settle);
          if (result && typeof result.then === "function") {
            result.then(settle).catch(reject);
          }
        } catch (err) {
          reject(err);
        }
      });
    },
  };
}
