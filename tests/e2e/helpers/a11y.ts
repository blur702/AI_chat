import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Run an axe-core accessibility audit on the current page.
 * Asserts zero WCAG 2.1 AA violations.
 */
export async function checkAccessibility(
  page: Page,
  options?: { exclude?: string[]; knownViolations?: string[] }
) {
  let builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
  ]);

  if (options?.exclude) {
    for (const selector of options.exclude) {
      builder = builder.exclude(selector);
    }
  }

  const results = await builder.analyze();

  // Filter out known violations that are tracked for future fixes
  const known = new Set(options?.knownViolations ?? []);
  const unexpected = results.violations.filter((v) => !known.has(v.id));
  const skipped = results.violations.filter((v) => known.has(v.id));

  if (skipped.length > 0) {
    const summary = skipped
      .map((v) => `[${v.impact}] ${v.id} (${v.nodes.length} nodes)`)
      .join(", ");
    console.log(`Known a11y violations (tracked): ${summary}`);
  }

  if (unexpected.length > 0) {
    const summary = unexpected
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node${v.nodes.length > 1 ? "s" : ""})`
      )
      .join("\n");
    console.log("Accessibility violations:\n" + summary);
  }

  expect(unexpected).toEqual([]);
}
