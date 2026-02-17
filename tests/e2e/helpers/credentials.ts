/**
 * Centralized test credentials. Read from environment variables with fallbacks.
 */
export const ADMIN_ID = process.env.ADMIN_ID ?? "kevin";
export const ADMIN_PW = process.env.ADMIN_PW ?? "(130Bpm)";
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "kevin.althaus@gmail.com";
