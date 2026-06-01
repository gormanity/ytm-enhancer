export const DEV_BUILD_PRESENCE_MESSAGE = "ytm-enhancer:dev-build-presence";
export const DEV_BUILD_PRESENCE_REQUEST_MESSAGE =
  "ytm-enhancer:get-dev-build-presence";
export const DEV_BUILD_HOTKEY_COMMAND_MESSAGE =
  "ytm-enhancer:forward-hotkey-command";
export const DEV_BUILD_PING_INTERVAL_MS = 1000;
export const DEV_BUILD_STALE_MS = 3500;

export const CHROMIUM_LOCAL_PROD_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqWc7cfsDV1eFaYsJ76VQf+v+vsJ9Joti497SXDthtjUgs/Bij3e6QVGkk49+xb1joO5JJoRKVCCcOuOnNlbn/ZHIkVEaPjhJDDOhcVcOCtCY1qKs0yiHURDuapRSTUMNGg4/vsIb+WB3yYDqhLjNnY7Vp5domufzvb7mu0QUAnRr2uh6PYLoZ+XsR9qhhiNUXTPonljAy6kGxOP5rGHefvGiCHGViFzCR2JcZ5MtJkEFy3X8a0OtnrBso44YchfgHIgKohLBsQ7V6aF1cej86XA7Bwzm/lWlbvL/1paoimlSjWae6EX3w38KhrOGc3kI42kw4Qv8eMWF+w57Ig0jCQIDAQAB";
export const CHROMIUM_LOCAL_DEV_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnFFge8PzDXXXxtxZqPiCZjnX6cLv5YXABs376PIdhT7rqZPs8Y08LYD8nDD95jOQAL8XRy/yuOi2W1oTQh/fmZ1TgZ+UIGcZSaAs8Uk3uZ0UCH2AOpxm1uKrzfKs9TQM9cseqUzdgmznqtuEZWxZSBoixRQs8QvdmVwUsctr3p/zc3omfVdsNjKP2tPJaywJfoTI9KaqEvh8sax8B92pIsE4+5302pgvB4qz9bn6VzU/+Kpa/qvH+nW+S5PCPQrLVP+Dc5M2V1yUCce5v3hDwL6OWadJXcle7S0ZDOdXVz8EcXC+cm4amv+6vK/ovgSsDw5lC2CnCfyrR6DfJCgakQIDAQAB";

export const CHROMIUM_LOCAL_PROD_EXTENSION_ID =
  "pggblbpjleekkobiinobaeeefnimgljh";
export const CHROMIUM_LOCAL_DEV_EXTENSION_ID =
  "akkbieodbakphpfdibailajdknnmmoca";
export const CHROMIUM_STORE_PROD_EXTENSION_ID =
  "bilcedjabgiedoamakekncokccabdccp";
export const CHROMIUM_PROD_EXTENSION_IDS = [
  CHROMIUM_LOCAL_PROD_EXTENSION_ID,
  CHROMIUM_STORE_PROD_EXTENSION_ID,
] as const;

export interface DevBuildPresenceMessage {
  type: typeof DEV_BUILD_PRESENCE_MESSAGE;
}

export interface DevBuildPresenceRequestMessage {
  type: typeof DEV_BUILD_PRESENCE_REQUEST_MESSAGE;
}

export interface DevBuildHotkeyCommandMessage {
  type: typeof DEV_BUILD_HOTKEY_COMMAND_MESSAGE;
  command: string;
}

export function isDevBuildPresenceMessage(
  message: unknown,
): message is DevBuildPresenceMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as Partial<DevBuildPresenceMessage>).type ===
      DEV_BUILD_PRESENCE_MESSAGE
  );
}

export function isDevBuildPresenceRequestMessage(
  message: unknown,
): message is DevBuildPresenceRequestMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as Partial<DevBuildPresenceRequestMessage>).type ===
      DEV_BUILD_PRESENCE_REQUEST_MESSAGE
  );
}

export function isDevBuildHotkeyCommandMessage(
  message: unknown,
): message is DevBuildHotkeyCommandMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as Partial<DevBuildHotkeyCommandMessage>).type ===
      DEV_BUILD_HOTKEY_COMMAND_MESSAGE &&
    typeof (message as Partial<DevBuildHotkeyCommandMessage>).command ===
      "string"
  );
}
