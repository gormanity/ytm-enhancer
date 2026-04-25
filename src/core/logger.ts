const PREFIX = "[YTM Enhancer]";

/** Log debug info. Stripped from production builds. */
export function debug(...args: unknown[]): void {
  if (__DEV__) console.log(PREFIX, ...args);
}

export function warn(...args: unknown[]): void {
  console.warn(PREFIX, ...args);
}

export function error(...args: unknown[]): void {
  console.error(PREFIX, ...args);
}
