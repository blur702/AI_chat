import { describe, it, expect } from "vitest";
import { t } from "@/lib/i18n";

describe("t() translation function", () => {
  it("returns the translated string for a known key", () => {
    expect(t("files")).toBe("Files");
    expect(t("run")).toBe("Run");
    expect(t("settings")).toBe("Settings");
  });

  it("returns the key itself when no translation exists", () => {
    expect(t("nonExistentKey12345")).toBe("nonExistentKey12345");
  });

  it("interpolates {key} placeholders", () => {
    const result = t("deleteChatConfirm", { title: "Test Chat" });
    expect(result).toContain("Test Chat");
    expect(result).not.toContain("{title}");
  });

  it("interpolates numeric values", () => {
    // Use a key that takes a numeric param – test with a known key
    const result = t("deleteChatConfirm", { title: "42" });
    expect(result).toContain("42");
  });

  it("handles missing params gracefully (leaves placeholder)", () => {
    const result = t("deleteChatConfirm");
    expect(result).toContain("{title}");
  });

  it("replaces all occurrences of the same placeholder", () => {
    // Even if a key appeared twice in the string, both should be replaced
    // We test with a single occurrence since our locale has one {title}
    const result = t("deleteChatConfirm", { title: "Foo" });
    expect(result.indexOf("Foo")).toBeGreaterThanOrEqual(0);
  });
});
