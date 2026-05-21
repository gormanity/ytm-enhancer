import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CHROMIUM_LOCAL_DEV_EXTENSION_ID,
  CHROMIUM_LOCAL_DEV_KEY,
  CHROMIUM_LOCAL_PROD_EXTENSION_ID,
  CHROMIUM_LOCAL_PROD_KEY,
} from "@/runtime-messages";
import { applyChromiumCoexistenceManifestFields } from "@/manifest-coexistence";

function extensionIdFromKey(key: string): string {
  const hash = createHash("sha256").update(Buffer.from(key, "base64")).digest();
  return [...hash.subarray(0, 16)]
    .map((byte) =>
      [byte >> 4, byte & 0x0f]
        .map((nibble) => String.fromCharCode("a".charCodeAt(0) + nibble))
        .join(""),
    )
    .join("");
}

describe("Chromium coexistence manifest fields", () => {
  it("derives different fixed IDs for local prod and local dev", () => {
    expect(extensionIdFromKey(CHROMIUM_LOCAL_PROD_KEY)).toBe(
      CHROMIUM_LOCAL_PROD_EXTENSION_ID,
    );
    expect(extensionIdFromKey(CHROMIUM_LOCAL_DEV_KEY)).toBe(
      CHROMIUM_LOCAL_DEV_EXTENSION_ID,
    );
    expect(CHROMIUM_LOCAL_PROD_EXTENSION_ID).not.toBe(
      CHROMIUM_LOCAL_DEV_EXTENSION_ID,
    );
  });

  it("uses explicit counterpart IDs for externally connectable builds", () => {
    const prodManifest: Record<string, unknown> = {};
    const devManifest: Record<string, unknown> = {};

    applyChromiumCoexistenceManifestFields(prodManifest, "chrome", false);
    applyChromiumCoexistenceManifestFields(devManifest, "chrome", true);

    expect(prodManifest).toMatchObject({
      key: CHROMIUM_LOCAL_PROD_KEY,
      externally_connectable: {
        ids: [CHROMIUM_LOCAL_DEV_EXTENSION_ID],
      },
    });
    expect(devManifest).toMatchObject({
      key: CHROMIUM_LOCAL_DEV_KEY,
      externally_connectable: {
        ids: [CHROMIUM_LOCAL_PROD_EXTENSION_ID],
      },
    });
  });
});
