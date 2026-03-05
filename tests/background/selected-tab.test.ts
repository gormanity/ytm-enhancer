import { describe, expect, it } from "vitest";
import {
  parseSelectedTabId,
  resolveSelectedTabId,
} from "@/background/selected-tab";

describe("selected-tab helpers", () => {
  describe("parseSelectedTabId", () => {
    it("returns a number when value is numeric", () => {
      expect(parseSelectedTabId(42)).toBe(42);
    });

    it("returns null for non-number values", () => {
      expect(parseSelectedTabId(null)).toBeNull();
      expect(parseSelectedTabId("42")).toBeNull();
      expect(parseSelectedTabId(undefined)).toBeNull();
    });
  });

  describe("resolveSelectedTabId", () => {
    it("keeps current selection when selected tab still exists", () => {
      const tabs = [
        { id: 100, active: false },
        { id: 200, active: true },
      ];
      expect(resolveSelectedTabId(tabs, 100)).toBe(100);
    });

    it("falls back to active tab when selected tab is missing", () => {
      const tabs = [
        { id: 100, active: false },
        { id: 200, active: true },
      ];
      expect(resolveSelectedTabId(tabs, 999)).toBe(200);
    });

    it("falls back to first tab when no active tab exists", () => {
      const tabs = [
        { id: 100, active: false },
        { id: 200, active: false },
      ];
      expect(resolveSelectedTabId(tabs, null)).toBe(100);
    });

    it("returns null when there are no valid tab IDs", () => {
      const tabs = [{ active: true }, { active: false }];
      expect(resolveSelectedTabId(tabs, 1)).toBeNull();
    });
  });
});
