declare const __BROWSER__: "chrome" | "firefox" | "edge";
declare const __DEV__: boolean;

// Firefox-only WebExtensions APIs not present in @types/chrome. The popup uses
// optional chaining and capability checks before calling these.
declare namespace chrome.commands {
  function update(detail: { name: string; shortcut: string }): Promise<void>;
  function reset(name: string): Promise<void>;
}

declare module "*.html?raw" {
  const content: string;
  export default content;
}

declare module "*.css?raw" {
  const content: string;
  export default content;
}

declare module "*.ts?raw" {
  const content: string;
  export default content;
}

declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.svg?raw" {
  const content: string;
  export default content;
}
