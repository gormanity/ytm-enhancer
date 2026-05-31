export type CommandHandler = (command: string) => void | Promise<void>;

export interface HotkeyRegistrationMetadata {
  moduleId: string;
  moduleName: string;
}

export interface RegisteredHotkeyCommand extends HotkeyRegistrationMetadata {
  command: string;
}

export interface HotkeyHandlerRegistry {
  register(
    command: string,
    handler: CommandHandler,
    metadata?: HotkeyRegistrationMetadata,
  ): void;
}

export class HotkeyRegistry implements HotkeyHandlerRegistry {
  private handlers = new Map<string, CommandHandler>();
  private registrations = new Map<string, RegisteredHotkeyCommand>();

  register(
    command: string,
    handler: CommandHandler,
    metadata?: HotkeyRegistrationMetadata,
  ): void {
    if (this.handlers.has(command)) {
      throw new Error(`Command "${command}" is already registered`);
    }
    this.handlers.set(command, handler);
    if (metadata) {
      this.registrations.set(command, { command, ...metadata });
    }
  }

  async dispatch(command: string): Promise<void> {
    const handler = this.handlers.get(command);
    if (handler) await handler(command);
  }

  has(command: string): boolean {
    return this.handlers.has(command);
  }

  listRegistrations(): RegisteredHotkeyCommand[] {
    return Array.from(this.registrations.values());
  }
}
