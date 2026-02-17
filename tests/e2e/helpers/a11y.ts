import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Run an axe-core accessibility audit on the current page.
 * Asserts zero WCAG 2.1 AA violations.
 */
export async function checkAccessibility(
  page: Page,
  options?: { exclude?: string[] }
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

  if (results.violations.length > 0) {
    const summary = results.violations
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node${v.nodes.length > 1 ? "s" : ""})`
      )
      .join("\n");
    console.log("Accessibility violations:\n" + summary);
  }

  expect(results.violations).toEqual([]);
}
