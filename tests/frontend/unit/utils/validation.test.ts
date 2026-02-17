import { describe, it, expect } from "vitest";
import {
  validateRequired,
  validateMinLength,
  validateMaxLength,
  validatePattern,
  validateFilename,
  validateFileSize,
  sanitizeFilename,
} from "@workstation/api/utils/validation";

describe("validateRequired", () => {
  it("returns error for empty string", () => {
    expect(validateRequired("")).toBe("This field is required");
  });
  it("returns error for whitespace-only string", () => {
    expect(validateRequired("   ")).toBe("This field is required");
  });
  it("returns null for non-empty string", () => {
    expect(validateRequired("hello")).toBeNull();
  });
});

describe("validateMinLength", () => {
  it("returns error when below min", () => {
    expect(validateMinLength("ab", 3)).toBe("Must be at least 3 characters");
  });
  it("returns null when at min", () => {
    expect(validateMinLength("abc", 3)).toBeNull();
  });
  it("returns null when above min", () => {
    expect(validateMinLength("abcd", 3)).toBeNull();
  });
});

describe("validateMaxLength", () => {
  it("returns error when above max", () => {
    expect(validateMaxLength("abcdef", 5)).toBe("Must be at most 5 characters");
  });
  it("returns null when at max", () => {
    expect(validateMaxLength("abcde", 5)).toBeNull();
  });
  it("returns null when below max", () => {
    expect(validateMaxLength("abc", 5)).toBeNull();
  });
});

describe("validatePattern", () => {
  it("returns null when pattern matches", () => {
    expect(validatePattern("abc123", /^[a-z0-9]+$/, "Invalid")).toBeNull();
  });
  it("returns error message when pattern does not match", () => {
    expect(validatePattern("abc 123", /^[a-z0-9]+$/, "No spaces allowed")).toBe("No spaces allowed");
  });
});

describe("validateFilename", () => {
  it("rejects empty filename", () => {
    expect(validateFilename("")).toBe("Filename cannot be empty");
  });
  it("rejects whitespace-only", () => {
    expect(validateFilename("   ")).toBe("Filename cannot be empty");
  });
  it("rejects filenames longer than 255 chars", () => {
    const long = "a".repeat(256);
    expect(validateFilename(long)).toBe("Filename is too long (max 255 characters)");
  });
  it("rejects filenames with invalid characters", () => {
    expect(validateFilename("file<name")).toBe("Filename contains invalid characters");
    expect(validateFilename("file:name")).toBe("Filename contains invalid characters");
    expect(validateFilename('file"name')).toBe("Filename contains invalid characters");
    expect(validateFilename("file|name")).toBe("Filename contains invalid characters");
  });
  it("rejects single dot", () => {
    expect(validateFilename(".")).toBe("Filename cannot be just a dot");
  });
  it("rejects double dot", () => {
    expect(validateFilename("..")).toBe("Filename cannot be '..'");
  });
  it("rejects reserved names (CON, PRN, etc)", () => {
    expect(validateFilename("CON")).toContain("reserved name");
    expect(validateFilename("con.txt")).toContain("reserved name");
    expect(validateFilename("LPT1")).toContain("reserved name");
  });
  it("rejects filenames ending with space or period", () => {
    expect(validateFilename("file ")).toBe("Filename cannot end with a space or period");
    expect(validateFilename("file.")).toBe("Filename cannot end with a space or period");
  });
  it("accepts valid filenames", () => {
    expect(validateFilename("readme.md")).toBeNull();
    expect(validateFilename(".gitignore")).toBeNull();
    expect(validateFilename("my-file_v2.txt")).toBeNull();
  });
});

describe("validateFileSize", () => {
  it("returns null when under limit", () => {
    expect(validateFileSize(1024, 5)).toBeNull();
  });
  it("returns error when over limit", () => {
    const result = validateFileSize(10 * 1024 * 1024, 5);
    expect(result).toContain("10.0 MB");
    expect(result).toContain("max 5 MB");
  });
  it("returns null when exactly at limit", () => {
    expect(validateFileSize(5 * 1024 * 1024, 5)).toBeNull();
  });
});

describe("sanitizeFilename", () => {
  it("replaces dangerous characters with underscores", () => {
    expect(sanitizeFilename("file<name>.txt")).toBe("file_name_.txt");
  });
  it("prefixes reserved names with underscore", () => {
    expect(sanitizeFilename("CON")).toBe("_CON");
    expect(sanitizeFilename("con.txt")).toBe("_con.txt");
  });
  it("trims trailing spaces and periods", () => {
    expect(sanitizeFilename("file. ")).toBe("file");
  });
  it("returns 'untitled' for empty input", () => {
    expect(sanitizeFilename("")).toBe("untitled");
  });
  it("truncates to 255 characters", () => {
    const long = "a".repeat(300);
    expect(sanitizeFilename(long).length).toBe(255);
  });
});
