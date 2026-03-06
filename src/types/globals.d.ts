declare const __BROWSER__: "chrome" | "firefox";

declare module "*.html?raw" {
  const content: string;
  export default content;
}

declare module "*.svg" {
  const content: string;
  export default content;
}
