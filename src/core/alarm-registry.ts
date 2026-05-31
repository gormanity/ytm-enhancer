export interface AlarmInfo {
  when?: number;
  delayInMinutes?: number;
  periodInMinutes?: number;
}

export interface AlarmEvent {
  name: string;
  scheduledTime?: number;
  periodInMinutes?: number;
}

export interface AlarmSchedulerClient {
  create(name: string, info: AlarmInfo): Promise<void>;
  clear(name: string): Promise<boolean>;
}

export type AlarmHandler = (alarm: AlarmEvent) => void | Promise<void>;

export interface AlarmHandlerRegistry {
  register(name: string, handler: AlarmHandler): void;
}

export class AlarmRegistry implements AlarmHandlerRegistry {
  private handlers = new Map<string, AlarmHandler>();

  register(name: string, handler: AlarmHandler): void {
    this.handlers.set(name, handler);
  }

  async dispatch(alarm: AlarmEvent): Promise<boolean> {
    const handler = this.handlers.get(alarm.name);
    if (!handler) return false;

    await handler(alarm);
    return true;
  }
}

interface BrowserAlarmsApi {
  create(name: string, info: AlarmInfo): void | Promise<void>;
  clear(name: string): boolean | Promise<boolean>;
}

function getBrowserAlarmsApi(): BrowserAlarmsApi | null {
  if (
    typeof chrome === "undefined" ||
    typeof chrome.alarms?.create !== "function" ||
    typeof chrome.alarms?.clear !== "function"
  ) {
    return null;
  }

  return chrome.alarms as unknown as BrowserAlarmsApi;
}

export function createAlarmSchedulerClient(
  alarmsApi: BrowserAlarmsApi | null = getBrowserAlarmsApi(),
): AlarmSchedulerClient {
  return {
    async create(name, info) {
      await alarmsApi?.create(name, info);
    },

    async clear(name) {
      if (!alarmsApi) return false;
      return alarmsApi.clear(name);
    },
  };
}
