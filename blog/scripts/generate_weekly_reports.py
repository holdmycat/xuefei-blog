#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path


@dataclass(frozen=True)
class LanguageConfig:
    lang: str
    title_template: str
    description_template: str
    body: str


LANGS: dict[str, LanguageConfig] = {
    "en": LanguageConfig(
        lang="en",
        title_template="{year}-{month:02d} Week {week}",
        description_template="Weekly report ({start} — {end}).",
        body=(
            "## Highlights\n"
            "- \n\n"
            "## Progress\n"
            "- \n\n"
            "## Next week\n"
            "- \n"
        ),
    ),
    "zh": LanguageConfig(
        lang="zh",
        title_template="{year}年{month:02d}月 第{week}周 周报",
        description_template="周报（{start} ～ {end}）。",
        body=(
            "## 本周要点\n"
            "- \n\n"
            "## 进展\n"
            "- \n\n"
            "## 下周计划\n"
            "- \n"
        ),
    ),
}


def ymd(d: date) -> str:
    return d.isoformat()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate weekly report stubs for Hugo.")
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="Path to repo root (defaults to auto-detected).",
    )
    parser.add_argument(
        "--start",
        type=str,
        default="2025-11-27",
        help="First week start date (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--end-year",
        type=int,
        default=2026,
        help="Generate up to end of this year (inclusive).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing files.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    start = date.fromisoformat(args.start)
    end = date(args.end_year, 12, 31)

    base = args.repo_root / "blog" / "content"
    created = 0
    skipped = 0

    week_in_month: dict[tuple[int, int], int] = {}
    current = start
    while current <= end:
        key = (current.year, current.month)
        week_index = week_in_month.get(key, 0) + 1
        week_in_month[key] = week_index

        if week_index <= 4:
            week_end = current + timedelta(days=6)
            slug = f"{current.year}-{current.month:02d}-w{week_index}"

            for lang, cfg in LANGS.items():
                out_dir = base / lang / "weekly"
                out_dir.mkdir(parents=True, exist_ok=True)
                filename = out_dir / f"{slug}.{cfg.lang}.md"

                if filename.exists() and not args.force:
                    skipped += 1
                    continue

                title = cfg.title_template.format(
                    year=current.year, month=current.month, week=week_index
                )
                description = cfg.description_template.format(
                    start=ymd(current), end=ymd(week_end)
                )

                content = (
                    "---\n"
                    f'title: "{title}"\n'
                    f"description: \"{description}\"\n"
                    f"date: {ymd(current)}\n"
                    f"slug: {slug}\n"
                    f"year: {current.year}\n"
                    f"month: {current.month}\n"
                    f"weekInMonth: {week_index}\n"
                    f"start: {ymd(current)}\n"
                    f"end: {ymd(week_end)}\n"
                    "---\n\n"
                    f"{cfg.body}"
                )
                filename.write_text(content, encoding="utf-8")
                created += 1

        current += timedelta(days=7)

    print(f"Created {created} files, skipped {skipped} existing files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

