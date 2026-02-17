const RESERVED_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

const DANGEROUS_CHARS_PATTERN = /[<>:"/\\|?*\x00-\x1f]/;
const DANGEROUS_CHARS_GLOBAL = /[<>:"/\\|?*\x00-\x1f]/g;

export function validateRequired(value: string): string | null {
  return value.trim().length === 0 ? "This field is required" : null;
}

export function validateMinLength(value: string, min: number): string | null {
  return value.length < min ? `Must be at least ${min} characters` : null;
}

export function validateMaxLength(value: string, max: number): string | null {
  return value.length > max ? `Must be at most ${max} characters` : null;
}

export function validatePattern(value: string, pattern: RegExp, message: string): string | null {
  return pattern.test(value) ? null : message;
}

export function validateFilename(name: string): string | null {
  if (!name || !name.trim()) return "Filename cannot be empty";
  const trimmed = name.trim();
  if (trimmed === ".") return "Filename cannot be just a dot";
  if (trimmed === "..") return "Filename cannot be '..'";
  if (trimmed.length > 255) return "Filename is too long (max 255 characters)";
  if (DANGEROUS_CHARS_PATTERN.test(trimmed)) return "Filename contains invalid characters";
  const baseName = trimmed.replace(/\.[^.]+$/, "").toUpperCase();
  if (RESERVED_NAMES.has(baseName)) return `"${baseName}" is a reserved name`;
  // Check raw name for trailing space/period (trim already handled leading/trailing whitespace)
  if (name.endsWith(" ") || name.endsWith(".")) return "Filename cannot end with a space or period";
  return null;
}

export function validateFileSize(size: number, maxMB: number): string | null {
  const maxBytes = maxMB * 1024 * 1024;
  if (size > maxBytes) {
    const sizeMB = (size / (1024 * 1024)).toFixed(1);
    return `File is ${sizeMB} MB (max ${maxMB} MB)`;
  }
  return null;
}

export function sanitizeFilename(name: string): string {
  let sanitized = name.trim();
  sanitized = sanitized.replace(DANGEROUS_CHARS_GLOBAL, "_");
  const baseName = sanitized.replace(/\.[^.]+$/, "").toUpperCase();
  if (RESERVED_NAMES.has(baseName)) {
    sanitized = `_${sanitized}`;
  }
  sanitized = sanitized.replace(/[. ]+$/, "");
  if (!sanitized) sanitized = "untitled";
  return sanitized.slice(0, 255);
}
