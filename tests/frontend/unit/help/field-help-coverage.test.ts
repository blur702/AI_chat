import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function walkTsxFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsxFiles(full));
    } else if (full.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function collectFieldHelpTags() {
  const appRoot = path.resolve(__dirname, "../../../../frontend/apps/chat");
  const files = walkTsxFiles(appRoot);
  const tags: Array<{ file: string; line: number; attrs: string }> = [];

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const re = /<FieldHelp\b([\s\S]*?)(?:\/>|><\/FieldHelp>)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      tags.push({ file, line, attrs: match[1] });
    }
  }

  return tags;
}

function collectOpenHelpSlugs() {
  const appRoot = path.resolve(__dirname, "../../../../frontend/apps/chat");
  const files = walkTsxFiles(appRoot);
  const slugs: Array<{ file: string; line: number; slug: string }> = [];

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const re = /openHelp\(\s*"([^"]+)"\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      slugs.push({ file, line, slug: match[1] });
    }
  }

  return slugs;
}

function collectHelpTopicSlugs() {
  const scriptPath = path.resolve(
    __dirname,
    "../../../../backend/scripts/insert_comprehensive_help_topics.py",
  );
  const scriptText = fs.readFileSync(scriptPath, "utf8");
  return new Set(
    [...scriptText.matchAll(/"slug"\s*:\s*"([^"]+)"/g)].map((m) => m[1]),
  );
}

function collectHelpTopicBodies() {
  const scriptPath = path.resolve(
    __dirname,
    "../../../../backend/scripts/insert_comprehensive_help_topics.py",
  );
  const scriptText = fs.readFileSync(scriptPath, "utf8");
  const topics = [
    ...scriptText.matchAll(
      /"slug"\s*:\s*"([^"]+)"[\s\S]*?"body"\s*:\s*"([\s\S]*?)",\s*\n\s*"tags"/g,
    ),
  ].map((m) => ({ slug: m[1], body: m[2] }));
  return topics;
}

describe("Field help coverage", () => {
  it("every FieldHelp includes a slug for deep-linking", () => {
    const tags = collectFieldHelpTags();
    const missing = tags.filter((t) => !/\bslug\s*=/.test(t.attrs));
    expect(missing).toEqual([]);
  });

  it("every FieldHelp slug has a detailed topic entry", () => {
    const tags = collectFieldHelpTags();
    const topicSlugs = collectHelpTopicSlugs();
    const missing: Array<{ slug: string; file: string; line: number }> = [];

    for (const tag of tags) {
      const slugMatch = tag.attrs.match(/\bslug\s*=\s*"([^"]+)"/);
      if (!slugMatch) continue;
      const slug = slugMatch[1];
      if (!topicSlugs.has(slug)) {
        missing.push({ slug, file: tag.file, line: tag.line });
      }
    }

    expect(missing).toEqual([]);
  });

  it("every openHelp call references an existing topic slug", () => {
    const used = collectOpenHelpSlugs();
    const topicSlugs = collectHelpTopicSlugs();
    const missing = used.filter((item) => !topicSlugs.has(item.slug));
    expect(missing).toEqual([]);
  });

  it("help topic bodies are comprehensive and non-trivial", () => {
    const topics = collectHelpTopicBodies();
    // Guard: ensure the regex didn't silently miss topics
    expect(topics.length).toBeGreaterThan(10);
    const tooShort = topics
      .filter((topic) => topic.body.trim().length < 120)
      .map((topic) => ({ slug: topic.slug, length: topic.body.trim().length }));
    expect(tooShort).toEqual([]);
  });
});
