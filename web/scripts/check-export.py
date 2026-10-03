#!/usr/bin/env python3
"""Check the committed static export without a package install or network access."""

from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_EXPORT_BYTES = 8 * 1024 * 1024
errors: list[str] = []
references: set[Path] = set()


def check_reference(value: str, owner: Path) -> None:
    """Only bundled resources are checked; navigation and RPC URLs are unrelated."""
    value = value.strip()
    if value.startswith("data:") or value.startswith("#"):
        return
    url = urlsplit(value)
    if not value or url.scheme or url.netloc or url.path.startswith(("/", "\\")):
        errors.append(f"{owner.relative_to(DIST)}: resource must use a relative URL: {value}")
        return
    target = (owner.parent / unquote(url.path)).resolve()
    if not target.is_relative_to(DIST.resolve()):
        errors.append(f"{owner.relative_to(DIST)}: resource escapes dist: {value}")
    elif not target.is_file():
        errors.append(f"{owner.relative_to(DIST)}: missing resource: {value}")
    else:
        references.add(target)


class Resources(HTMLParser):
    def __init__(self, owner: Path):
        super().__init__()
        self.owner = owner

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "base":
            errors.append(f"{self.owner.relative_to(DIST)}: base tags can break gateway subpaths")
        if tag in {"script", "img", "source", "video", "audio", "iframe", "embed"}:
            if values.get("src") is not None:
                check_reference(values["src"], self.owner)
        if tag == "video" and values.get("poster") is not None:
            check_reference(values["poster"], self.owner)
        if tag == "link" and values.get("href") is not None:
            check_reference(values["href"], self.owner)
        if tag in {"img", "source"} and values.get("srcset"):
            # This export uses file URLs, so commas delimit candidates.
            for candidate in values["srcset"].split(","):
                check_reference(candidate.strip().split()[0], self.owner)


def main() -> int:
    index = DIST / "index.html"
    if not index.is_file():
        print("FAIL: dist/index.html is missing", file=sys.stderr)
        return 1
    files = sorted(path for path in DIST.rglob("*") if path.is_file())
    total = 0
    for path in files:
        relative = path.relative_to(DIST)
        size = path.stat().st_size
        total += size
        if path.is_symlink() or not path.resolve().is_relative_to(DIST.resolve()):
            errors.append(f"{relative}: symlinked resources are not self-contained")
        if any(part in {"node_modules", ".vite", ".cache", ".npm"} for part in relative.parts):
            errors.append(f"{relative}: dependency/cache directory in production export")
        if path.suffix.lower() in {".map", ".tgz", ".tar", ".zip", ".gz", ".bz2", ".xz", ".7z"}:
            errors.append(f"{relative}: source map or packaging archive in production export")
        if size > MAX_FILE_BYTES:
            errors.append(f"{relative}: {size:,} bytes exceeds the 2 MiB asset budget")
        if path.suffix == ".html":
            Resources(path).feed(path.read_text())
        if path.suffix == ".css":
            css = path.read_text()
            for match in re.finditer(r"url\(\s*(['\"]?)(.*?)\1\s*\)", css):
                check_reference(match.group(2), path)
            for match in re.finditer(r"@import\s+(['\"])(.*?)\1", css):
                check_reference(match.group(2), path)
    if total > MAX_EXPORT_BYTES:
        errors.append(f"dist is {total:,} bytes, exceeding the entire 8 MiB submission budget")
    if not any(path.suffix == ".js" for path in references):
        errors.append("index.html must reference a bundled JavaScript entry")
    if not any(path.suffix == ".css" for path in references):
        errors.append("index.html must reference a bundled stylesheet")
    if errors:
        print("FAIL:\n" + "\n".join(f"- {message}" for message in errors), file=sys.stderr)
        return 1
    print(f"PASS: {len(files)} export files; {total:,} bytes; {len(references)} local HTML/CSS resource references")
    print("Relative resources exist; no source maps, dependency archives, caches, or oversized assets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
