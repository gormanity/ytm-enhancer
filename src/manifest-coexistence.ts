import {
  CHROMIUM_LOCAL_DEV_EXTENSION_ID,
  CHROMIUM_LOCAL_DEV_KEY,
  CHROMIUM_LOCAL_PROD_KEY,
  CHROMIUM_PROD_EXTENSION_IDS,
} from "./runtime-messages";

function removeSuggestedCommandShortcuts(manifest: Record<string, unknown>) {
  const commands = manifest.commands;
  if (!commands || typeof commands !== "object" || Array.isArray(commands)) {
    return;
  }

  for (const command of Object.values(commands)) {
    if (!command || typeof command !== "object" || Array.isArray(command)) {
      continue;
    }
    delete (command as { suggested_key?: unknown }).suggested_key;
  }
}

export function applyChromiumCoexistenceManifestFields(
  manifest: Record<string, unknown>,
  browser: string,
  isDev: boolean,
): void {
  if (browser !== "chrome") return;

  manifest.key = isDev ? CHROMIUM_LOCAL_DEV_KEY : CHROMIUM_LOCAL_PROD_KEY;
  if (isDev) {
    removeSuggestedCommandShortcuts(manifest);
  }
  manifest.externally_connectable = {
    ids: isDev
      ? [...CHROMIUM_PROD_EXTENSION_IDS]
      : [CHROMIUM_LOCAL_DEV_EXTENSION_ID],
  };
}
