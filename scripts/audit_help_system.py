"""
Audit the in-app help system for linkage and coverage issues.

Checks:
1. FieldHelp slugs used in frontend have matching seeded help topics.
2. openHelp("slug") targets have matching seeded help topics.
3. Seeded topics that are never referenced in the frontend.
4. Heuristic label coverage: form labels without nearby FieldHelp components.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
FRONTEND_CHAT_ROOT = ROOT / "frontend" / "apps" / "chat"
HELP_SEED_FILE = ROOT / "backend" / "scripts" / "insert_comprehensive_help_topics.py"


@dataclass
class Ref:
    file: str
    line: int
    slug: str


@dataclass
class MissingLabelHelp:
    file: str
    line: int
    label: str


def _walk_tsx_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*.tsx"):
        yield path


def _line_number(text: str, index: int) -> int:
    return text[:index].count("\n") + 1


def collect_field_help_refs() -> list[Ref]:
    refs: list[Ref] = []
    tag_re = re.compile(r"<FieldHelp\b([\s\S]*?)(?:/?>)")
    slug_re = re.compile(r'\bslug\s*=\s*"([^"]+)"')

    for file in _walk_tsx_files(FRONTEND_CHAT_ROOT):
        text = file.read_text(encoding="utf-8")
        for m in tag_re.finditer(text):
            slug_m = slug_re.search(m.group(1))
            if not slug_m:
                continue
            refs.append(
                Ref(
                    file=str(file.relative_to(ROOT)).replace("\\", "/"),
                    line=_line_number(text, m.start()),
                    slug=slug_m.group(1),
                )
            )
    return refs


def collect_open_help_refs() -> list[Ref]:
    refs: list[Ref] = []
    re_open = re.compile(r'openHelp\(\s*"([^"]+)"\s*\)')

    for file in _walk_tsx_files(FRONTEND_CHAT_ROOT):
        text = file.read_text(encoding="utf-8")
        for m in re_open.finditer(text):
            refs.append(
                Ref(
                    file=str(file.relative_to(ROOT)).replace("\\", "/"),
                    line=_line_number(text, m.start()),
                    slug=m.group(1),
                )
            )
    return refs


def collect_seed_slugs() -> set[str]:
    text = HELP_SEED_FILE.read_text(encoding="utf-8")
    return set(re.findall(r'"slug"\s*:\s*"([^"]+)"', text))


def collect_labels_missing_help(window_lines: int = 4) -> list[MissingLabelHelp]:
    """
    Heuristic: a <label ...> line should include FieldHelp on the same line
    or within the following N lines.
    """
    issues: list[MissingLabelHelp] = []
    label_re = re.compile(r"<label\b[^>]*>(.*?)</label>|<label\b[^>]*>")

    for file in _walk_tsx_files(FRONTEND_CHAT_ROOT):
        text = file.read_text(encoding="utf-8")
        lines = text.splitlines()
        for i, line in enumerate(lines):
            m = label_re.search(line)
            if not m:
                continue

            # Ignore hidden/utility labels where help icon is usually not useful
            compact = line.lower()
            if 'className="sr-only"' in line or "aria-label" in compact:
                continue

            nearby = "\n".join(lines[i : min(len(lines), i + window_lines + 1)])
            if "FieldHelp" in nearby:
                continue

            label_text = (m.group(1) or "").strip()
            issues.append(
                MissingLabelHelp(
                    file=str(file.relative_to(ROOT)).replace("\\", "/"),
                    line=i + 1,
                    label=label_text[:120],
                )
            )

    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit help system linkage and coverage")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero when issues are found",
    )
    parser.add_argument(
        "--label-window",
        type=int,
        default=4,
        help="Lines after a <label> tag to look for FieldHelp",
    )
    args = parser.parse_args()

    field_refs = collect_field_help_refs()
    open_refs = collect_open_help_refs()
    seed_slugs = collect_seed_slugs()
    label_issues = collect_labels_missing_help(window_lines=args.label_window)

    used_slugs = {r.slug for r in field_refs} | {r.slug for r in open_refs}
    missing_field_slugs = [asdict(r) for r in field_refs if r.slug not in seed_slugs]
    missing_open_slugs = [asdict(r) for r in open_refs if r.slug not in seed_slugs]
    orphan_seed_slugs = sorted(seed_slugs - used_slugs)

    report = {
        "counts": {
            "field_help_refs": len(field_refs),
            "open_help_refs": len(open_refs),
            "seed_slugs": len(seed_slugs),
            "missing_field_slugs": len(missing_field_slugs),
            "missing_open_slugs": len(missing_open_slugs),
            "orphan_seed_slugs": len(orphan_seed_slugs),
            "labels_missing_help_heuristic": len(label_issues),
        },
        "missing_field_slugs": missing_field_slugs,
        "missing_open_slugs": missing_open_slugs,
        "orphan_seed_slugs": orphan_seed_slugs,
        "labels_missing_help_heuristic": [asdict(item) for item in label_issues],
    }

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        counts = report["counts"]
        print("Help System Audit")
        print("=================")
        for key, value in counts.items():
            print(f"{key}: {value}")

        if missing_field_slugs:
            print("\nMissing FieldHelp slugs in seed topics:")
            for item in missing_field_slugs[:30]:
                print(f"- {item['slug']} ({item['file']}:{item['line']})")

        if missing_open_slugs:
            print("\nMissing openHelp slugs in seed topics:")
            for item in missing_open_slugs[:30]:
                print(f"- {item['slug']} ({item['file']}:{item['line']})")

        if orphan_seed_slugs:
            print("\nSeed slugs not referenced in frontend:")
            for slug in orphan_seed_slugs[:30]:
                print(f"- {slug}")

        if label_issues:
            print("\nHeuristic labels missing nearby FieldHelp:")
            for item in label_issues[:30]:
                label = item.label or "<label>"
                print(f"- {label} ({item.file}:{item.line})")

    has_issues = any(
        (
            missing_field_slugs,
            missing_open_slugs,
            label_issues,
        )
    )
    return 1 if (args.strict and has_issues) else 0


if __name__ == "__main__":
    raise SystemExit(main())

