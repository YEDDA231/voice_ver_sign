"""One-off project rename helper — updates branding and path references."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", ".venv", "venv", "models", "node_modules", "__pycache__"}
EXTENSIONS = {".py", ".js", ".html", ".css", ".md", ".yml", ".json", ".example", ".txt"}

REPLACEMENTS = [
    ("Voice Ver Sign", "Voice Ver Sign"),
    ("voice_ver_sign", "voice_ver_sign"),
    ("voice_ver_sign", "voice_ver_sign"),
    ("__VOICE_VER_SIGN_DASHBOARD__", "__VOICE_VER_SIGN_DASHBOARD__"),
    ("VVS_", "VVS_"),
    ("https://github.com/keneyias666/voice_ver_sign", "https://github.com/keneyias666/voice_ver_sign"),
    # UTF-8 mojibake fixes (PowerShell Set-Content corruption)
    ("\u00e2\u20ac\u201d", "\u2014"),  # â€" -> em dash
    ("\u00e2\u2020\u2019", "\u2192"),  # â†' -> arrow
    ("\u00e2\u2014\u008f", "\u25cf"),  # â— -> bullet
    ("\u00e2\u201d\u20ac\u00e2\u201d\u20ac", "\u2500\u2500"),  # â"€â"€ -> ──
]


def should_process(path: Path) -> bool:
    if path.suffix.lower() not in EXTENSIONS:
        return False
    return not SKIP_DIRS.intersection(path.parts)


def main() -> None:
    updated = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            path = Path(dirpath) / name
            if not should_process(path):
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            original = text
            for old, new in REPLACEMENTS:
                text = text.replace(old, new)
            if text != original:
                path.write_text(text, encoding="utf-8", newline="\n")
                updated += 1
                print(f"updated: {path.relative_to(ROOT)}")

    print(f"\nDone. Updated {updated} files.")


if __name__ == "__main__":
    main()
