export type CommandHandler = (command: string) => void | Promise<void>;

export class HotkeyRegistry {
  private handlers = new Map<string, CommandHandler>();

  register(command: string, handler: CommandHandler): void {
    if (this.handlers.has(command)) {
      throw new Error(`Command "${command}" is already registered`);
    }
    this.handlers.set(command, handler);
  }

  async dispatch(command: string): Promise<void> {
    const handler = this.handlers.get(command);
    if (handler) await handler(command);
  }

  has(command: string): boolean {
    return this.handlers.has(command);
  }
}
