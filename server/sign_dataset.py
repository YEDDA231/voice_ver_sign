"""Index Collated (A–Z images) and FSL-105 video clips for recognition + playback."""
from __future__ import annotations

import csv
import re
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

SIGNS_ROOT = Path(__file__).resolve().parent.parent / "Signs"
COLLATED_DIR = SIGNS_ROOT / "Collated"
FSL_DIR = SIGNS_ROOT / "FSL-105 A dataset for recognizing 105 Filipino sign language videos"
FSL_CLIPS = FSL_DIR / "Clips"
FSL_LABELS = FSL_DIR / "labels.csv"
THUMB_DIR = Path(__file__).resolve().parent.parent / "data" / "fsl_thumbs"
FRAME_DIR = Path(__file__).resolve().parent.parent / "data" / "fsl_frames"
FSL_FRAME_COUNT = 20

_LETTER_RE = re.compile(r"^[A-Z]$")
_warmup_lock = threading.Lock()
_warmed = False


def _norm_label(text: str) -> str:
    t = (text or "").upper().replace("'", "").replace("’", "")
    t = re.sub(r"[^A-Z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def load_fsl_labels() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not FSL_LABELS.exists():
        return rows
    with FSL_LABELS.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        for raw in reader:
            try:
                lid = int(raw.get("id", -1))
            except (TypeError, ValueError):
                continue
            label = (raw.get("label") or "").strip()
            category = (raw.get("category") or "").strip()
            if lid < 0 or not label:
                continue
            rows.append(
                {
                    "id": lid,
                    "label": label,
                    "category": category,
                    "key": _norm_label(label),
                }
            )
    rows.sort(key=lambda r: r["id"])
    return rows


@lru_cache(maxsize=1)
def fsl_by_key() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in load_fsl_labels():
        out[row["key"]] = row
        compact = row["key"].replace(" ", "")
        out.setdefault(compact, row)
    return out


def collated_letters() -> list[str]:
    if not COLLATED_DIR.is_dir():
        return []
    letters = []
    for p in sorted(COLLATED_DIR.iterdir()):
        if p.is_dir() and _LETTER_RE.match(p.name.upper()):
            letters.append(p.name.upper())
    return letters


def pick_collated_images(letter: str, limit: int = 4) -> list[Path]:
    letter = (letter or "").upper().strip()
    if not _LETTER_RE.match(letter):
        return []
    folder = COLLATED_DIR / letter
    if not folder.is_dir():
        return []
    jpgs = [p for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
    if not jpgs:
        return []
    plain = [p for p in jpgs if re.match(r"^\d+\.(jpg|jpeg|png)$", p.name, re.I)]
    pool = sorted(plain or jpgs, key=lambda p: p.name)
    if len(pool) <= limit:
        return pool
    step = max(1, len(pool) // limit)
    return pool[::step][:limit]


def pick_collated_image(letter: str) -> Optional[Path]:
    imgs = pick_collated_images(letter, limit=1)
    if imgs:
        return imgs[0]
    more = pick_collated_images(letter, limit=4)
    return more[0] if more else None


def pick_fsl_video(label_id: int) -> Optional[Path]:
    vids = list_fsl_videos(label_id)
    return vids[0] if vids else None


def fsl_frame_dir(label_id: int) -> Path:
    return FRAME_DIR / f"{int(label_id):03d}"


def extract_fsl_frames(label_id: int, count: int = FSL_FRAME_COUNT) -> list[Path]:
    """Pull evenly spaced full-size JPEG frames from an FSL-105 clip for browser playback."""
    dest = fsl_frame_dir(label_id)
    existing = sorted(dest.glob("*.jpg"))
    if len(existing) >= 8:
        return existing
    video = pick_fsl_video(label_id)
    if not video:
        return existing
    try:
        import cv2
    except ImportError:
        return existing
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        return existing
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    dest.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []
    if total <= 0:
        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            if idx % 8 == 0:
                path = dest / f"{len(saved):02d}.jpg"
                cv2.imwrite(str(path), _scale_frame(frame), [int(cv2.IMWRITE_JPEG_QUALITY), 88])
                saved.append(path)
                if len(saved) >= count:
                    break
            idx += 1
    else:
        picks = [int(i * (total - 1) / max(count - 1, 1)) for i in range(count)]
        seen = set()
        for pos in picks:
            if pos in seen:
                continue
            seen.add(pos)
            cap.set(cv2.CAP_PROP_POS_FRAMES, pos)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            path = dest / f"{len(saved):02d}.jpg"
            cv2.imwrite(str(path), _scale_frame(frame), [int(cv2.IMWRITE_JPEG_QUALITY), 88])
            saved.append(path)
    cap.release()
    return saved or sorted(dest.glob("*.jpg"))


def _scale_frame(frame):
    import cv2

    h, w = frame.shape[:2]
    max_w = 720
    if w <= max_w:
        return frame
    scale = max_w / w
    return cv2.resize(frame, (int(w * scale), int(h * scale)))


def fsl_match_payload(row: dict[str, Any]) -> dict[str, Any]:
    lid = int(row["id"])
    return {
        "type": "fsl",
        "id": lid,
        "label": row["label"],
        "category": row.get("category") or "",
        "source": "fsl-105",
        "imageUrl": f"/api/signs/media/fsl/{lid}",
        "videoUrl": f"/api/signs/video/fsl/{lid}",
        "framesUrl": f"/api/signs/frames/fsl/{lid}",
    }


def letter_match_payload(ch: str) -> dict[str, Any]:
    return {
        "type": "letter",
        "letter": ch,
        "label": ch,
        "source": "collated",
        "imageUrl": f"/api/signs/media/letter/{ch}",
    }
    letter = (letter or "").upper().strip()
    if not _LETTER_RE.match(letter):
        return None
    folder = COLLATED_DIR / letter
    if not folder.is_dir():
        return None
    jpgs = [p for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
    if not jpgs:
        return None
    plain = [p for p in jpgs if re.match(r"^\d+\.(jpg|jpeg|png)$", p.name, re.I)]
    pool = plain or jpgs
    pool.sort(key=lambda p: p.name)
    return pool[len(pool) // 2]


def list_fsl_videos(label_id: int) -> list[Path]:
    folder = FSL_CLIPS / str(int(label_id))
    if not folder.is_dir():
        return []
    vids = [
        p
        for p in folder.iterdir()
        if p.suffix.lower() in {".mov", ".mp4", ".avi", ".mkv", ".webm"}
    ]
    vids.sort(key=lambda p: p.name)
    return vids


def fsl_thumb_path(label_id: int) -> Path:
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    return THUMB_DIR / f"{int(label_id):03d}.jpg"


def extract_fsl_thumb(label_id: int) -> Optional[Path]:
    dest = fsl_thumb_path(label_id)
    if dest.exists() and dest.stat().st_size > 500:
        return dest
    videos = list_fsl_videos(label_id)
    if not videos:
        return dest if dest.exists() else None
    try:
        import cv2
    except ImportError:
        return None
    cap = cv2.VideoCapture(str(videos[0]))
    if not cap.isOpened():
        return None
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    target = max(0, total // 2) if total > 2 else 0
    if target:
        cap.set(cv2.CAP_PROP_POS_FRAMES, target)
    ok, frame = cap.read()
    if not ok:
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ok, frame = cap.read()
    cap.release()
    if not ok or frame is None:
        return None
    h, w = frame.shape[:2]
    scale = 720 / max(w, 1)
    if scale < 1:
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
    dest.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dest), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    return dest if dest.exists() else None


def warmup_dataset() -> dict[str, Any]:
    global _warmed
    with _warmup_lock:
        letters = collated_letters()
        labels = load_fsl_labels()
        thumbs = 0
        for row in labels:
            if extract_fsl_thumb(row["id"]):
                thumbs += 1
        _warmed = True
        return {
            "collatedLetters": len(letters),
            "fslClasses": len(labels),
            "fslThumbs": thumbs,
            "collatedDir": str(COLLATED_DIR),
            "fslDir": str(FSL_DIR),
        }


def dataset_health() -> dict[str, Any]:
    letters = collated_letters()
    labels = load_fsl_labels()
    try:
        import cv2  # noqa: F401

        vision = True
    except ImportError:
        vision = False
    return {
        "ready": bool(letters or labels),
        "modelLoaded": vision and bool(labels or letters),
        "visionReady": vision,
        "collatedLetters": letters,
        "fslClassCount": len(labels),
        "warmed": _warmed,
        "message": (
            f"Collated A–Z recognition ready ({len(letters)} letters). "
            f"FSL-105 videos ready ({len(labels)} signs)."
            if (letters or labels)
            else "Sign folders not found."
        ),
    }


def catalog() -> dict[str, Any]:
    letters = []
    for ch in collated_letters():
        letters.append(
            {
                "letter": ch,
                "label": ch,
                "source": "collated",
                "imageUrl": f"/api/signs/media/letter/{ch}",
            }
        )
    fsl = []
    for row in load_fsl_labels():
        fsl.append(fsl_match_payload(row))
    return {
        "letters": letters,
        "fsl": fsl,
        "supportedSigns": [r["label"] for r in load_fsl_labels()] + collated_letters(),
    }


def resolve_text_to_signs(text: str) -> dict[str, Any]:
    original = (text or "").strip()
    if not original:
        return {"text": "", "matches": [], "message": "No text to translate."}

    key = _norm_label(original)
    matches: list[dict[str, Any]] = []

    phrases = sorted(load_fsl_labels(), key=lambda r: len(r["key"]), reverse=True)
    remaining = f" {key} "
    for row in phrases:
        phrase = row["key"]
        if not phrase:
            continue
        token = f" {phrase} "
        if token in remaining:
            matches.append(fsl_match_payload(row))
            remaining = remaining.replace(token, " ", 1)

    for ch in key.replace(" ", ""):
        if _LETTER_RE.match(ch) and pick_collated_image(ch):
            matches.append(letter_match_payload(ch))

    # Prefer phrase matches; keep letters only when no FSL phrase hit or for leftover spelling
    fsl_hits = [m for m in matches if m["type"] == "fsl"]
    letter_hits = [m for m in matches if m["type"] == "letter"]
    leftover = re.sub(r"\s+", "", remaining)
    if fsl_hits:
        extra_letters = []
        compact_hits = {h["label"].replace(" ", "") for h in fsl_hits}
        if leftover and leftover not in compact_hits:
            extra_letters = [m for m in letter_hits if m["letter"] in leftover][:12]
        ordered = fsl_hits + extra_letters
    else:
        ordered = letter_hits

    if not ordered:
        msg = (
            f'No FSL-105 or Collated match for "{original}". '
            "Try a listed sign (HELLO, THANK YOU, YES) or spell a word."
        )
    else:
        names = ", ".join(m["label"] for m in ordered[:12])
        msg = f'Voice → Sign: "{original}" → {names}'

    return {"text": original, "matches": ordered[:16], "message": msg}


def chat_translation(text: str) -> str:
    result = resolve_text_to_signs(text)
    if not result["matches"]:
        return result["message"]
    lines = [result["message"], ""]
    for m in result["matches"][:10]:
        if m["type"] == "fsl":
            lines.append(f"• {m['label']} ({m.get('category') or 'FSL-105'})")
            lines.append(f":::sign fsl {m['id']}|{m['label']}")
        else:
            lines.append(f"• Letter {m['label']} (Collated)")
            lines.append(f":::sign letter {m['label']}")
    return "\n".join(lines)
