import React from "react";
import { describe, it, expect, vi } from "vitest";

/**
 * ModelSelectorDialog is a complex component with deep coupling to
 * useModelSwitcher, useWebSocket, and useAuth hooks, plus many
 * @workstation/ui compound components. It requires extensive mock
 * scaffolding that makes unit tests brittle and low-value.
 *
 * Recommended: test via E2E (Playwright) or integration tests
 * where the real hooks and components interact naturally.
 */

describe("ModelSelectorDialog", () => {
  it.todo("does not render when open=false");
  it.todo("renders dialog with tabs when open=true");
  it.todo("shows installed models in the Installed tab");
  it.todo("allows selecting and applying a model");
  it.todo("shows pull progress when downloading a model");
});
