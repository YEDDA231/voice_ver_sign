"""
Live Filipino Sign Language recognition using Collated (A–Z) stills and FSL-105 clips.

Primary path: MediaPipe-style hand landmarks from the browser.
Fallback: OpenCV template matching against dataset thumbnails.
"""
from __future__ import annotations

import base64
import threading
from typing import Any, Optional

from . import sign_dataset as dataset

_templates_lock = threading.Lock()
_templates: list[dict[str, Any]] = []
_templates_ready = False

# MediaPipe Hands indices
WRIST, THUMB_CMC, THUMB_MCP, THUMB_IP, THUMB_TIP = 0, 1, 2, 3, 4
INDEX_MCP, INDEX_PIP, INDEX_DIP, INDEX_TIP = 5, 6, 7, 8
MIDDLE_MCP, MIDDLE_PIP, MIDDLE_DIP, MIDDLE_TIP = 9, 10, 11, 12
RING_MCP, RING_PIP, RING_DIP, RING_TIP = 13, 14, 15, 16
PINKY_MCP, PINKY_PIP, PINKY_DIP, PINKY_TIP = 17, 18, 19, 20


def _xy(hand: list, idx: int) -> tuple[float, float]:
    pt = hand[idx]
    if isinstance(pt, dict):
        return float(pt.get("x", 0)), float(pt.get("y", 0))
    return float(pt[0]), float(pt[1])


def _finger_up(hand: list, tip: int, pip: int) -> bool:
    _, ty = _xy(hand, tip)
    _, py = _xy(hand, pip)
    return ty < py - 0.03


def _thumb_out(hand: list) -> bool:
    tx, ty = _xy(hand, THUMB_TIP)
    ix, iy = _xy(hand, INDEX_MCP)
    wx, wy = _xy(hand, WRIST)
    return abs(tx - wx) > abs(ix - wx) * 0.55 or abs(tx - ix) > 0.08


def _dist(hand: list, a: int, b: int) -> float:
    ax, ay = _xy(hand, a)
    bx, by = _xy(hand, b)
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5


def _finger_pattern(hand: list) -> tuple[bool, bool, bool, bool, bool]:
    thumb = _finger_up(hand, THUMB_TIP, THUMB_IP) or _thumb_out(hand)
    index = _finger_up(hand, INDEX_TIP, INDEX_PIP)
    middle = _finger_up(hand, MIDDLE_TIP, MIDDLE_PIP)
    ring = _finger_up(hand, RING_TIP, RING_PIP)
    pinky = _finger_up(hand, PINKY_TIP, PINKY_PIP)
    # Thumb "up" in image space is unreliable; also treat lateral extension
    ttip, tip_y = _xy(hand, THUMB_TIP)
    ipx, ipy = _xy(hand, THUMB_IP)
    thumb = thumb or abs(ttip - ipx) > 0.045
    return thumb, index, middle, ring, pinky


def classify_landmarks(hand: list) -> tuple[str, float, str]:
    """Return (label, confidence, kind) from 21 hand landmarks."""
    if not hand or len(hand) < 21:
        return "", 0.0, ""

    t, i, m, r, p = _finger_pattern(hand)
    count = sum([i, m, r, p])
    thumb_index = _dist(hand, THUMB_TIP, INDEX_TIP)
    open_palm = i and m and r and p

    # ILY / I LOVE YOU (FSL overlap)
    if i and p and t and not m and not r:
        return "I LOVE YOU", 0.86, "fsl"
    if i and p and not m and not r:
        return "I LOVE YOU", 0.72, "fsl"

    # Numbers (FSL-105)
    if i and not m and not r and not p and not t:
        return "ONE", 0.82, "fsl"
    if i and m and not r and not p:
        return "TWO", 0.8, "fsl"
    if i and m and r and not p:
        return "THREE", 0.78, "fsl"
    if i and m and r and p and not t:
        return "FOUR", 0.8, "fsl"
    if open_palm and t:
        return "FIVE", 0.78, "fsl"

    # YES: fist (A-like). Prefer YES when thumb is across the fingers.
    if not i and not m and not r and not p:
        if t and thumb_index < 0.12:
            return "A", 0.8, "letter"
        return "YES", 0.7, "fsl"

    # HELLO / B: four fingers up, thumb tucked
    if open_palm and not t:
        return "HELLO", 0.74, "fsl"

    # NO: index + middle + thumb pinch-ish
    if i and m and t and not r and not p:
        return "NO", 0.62, "fsl"

    # Alphabet (Collated)
    letter, conf = _classify_letter(hand, t, i, m, r, p, thumb_index)
    if letter:
        return letter, conf, "letter"

    if open_palm:
        return "HELLO", 0.6, "fsl"
    return "", 0.0, ""


def _classify_letter(
    hand: list,
    t: bool,
    i: bool,
    m: bool,
    r: bool,
    p: bool,
    thumb_index: float,
) -> tuple[str, float]:
    pinch = thumb_index < 0.07
    if not i and not m and not r and not p and t:
        return "A", 0.78
    if i and m and r and p and not t:
        return "B", 0.8
    if not i and not m and not r and not p and 0.07 <= thumb_index <= 0.18:
        return "C", 0.68
    if i and not m and not r and not p and pinch:
        return "D", 0.74
    if not i and not m and not r and not p and not t:
        return "E", 0.7
    if m and r and p and pinch:
        return "F", 0.76
    if i and m and t and not r and not p:
        return "K", 0.66
    if i and t and not m and not r and not p and _xy(hand, INDEX_TIP)[1] > _xy(hand, INDEX_PIP)[1]:
        return "G", 0.6
    if i and m and not r and not p and t:
        return "H", 0.62
    if p and not i and not m and not r:
        return "I", 0.8
    if p and t and not i and not m and not r:
        return "Y", 0.78
    if i and not m and not r and not p and t:
        return "L", 0.82
    if not i and not m and not r and not p:
        return "M", 0.55
    if i and m and r and p and t:
        return "B", 0.6
    if i and m and r and not p and t:
        return "W", 0.7
    if i and m and not r and not p and pinch:
        return "R", 0.58
    if i and not m and not r and not p:
        return "D", 0.6
    if m and r and p and i and pinch:
        return "F", 0.6
    if t and i and m and not r and not p:
        return "K", 0.58
    if i and m and r and p:
        return "B", 0.58
    return "", 0.0


def _decode_frame(image_base64: str):
    try:
        import cv2
        import numpy as np
    except ImportError:
        return None
    raw = (image_base64 or "").strip()
    if "," in raw[:40]:
        raw = raw.split(",", 1)[1]
    if len(raw) < 50:
        return None
    try:
        buf = base64.b64decode(raw)
        arr = np.frombuffer(buf, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception:
        return None


def _prep_gray(img) -> Optional[Any]:
    try:
        import cv2
    except ImportError:
        return None
    if img is None:
        return None
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    # Signing space: central / upper-body crop
    y0, y1 = int(h * 0.08), int(h * 0.92)
    x0, x1 = int(w * 0.15), int(w * 0.85)
    crop = gray[y0:y1, x0:x1]
    if crop.size == 0:
        crop = gray
    crop = cv2.resize(crop, (128, 128))
    crop = cv2.equalizeHist(crop)
    return crop.astype("float32") / 255.0


def _ncc(a, b) -> float:
    import numpy as np

    av = a.ravel()
    bv = b.ravel()
    av = av - av.mean()
    bv = bv - bv.mean()
    denom = (float(np.linalg.norm(av)) * float(np.linalg.norm(bv))) + 1e-6
    return float(np.dot(av, bv) / denom)


def _ensure_templates() -> list[dict[str, Any]]:
    global _templates, _templates_ready
    if _templates_ready and _templates:
        return _templates
    with _templates_lock:
        if _templates_ready and _templates:
            return _templates
        packed: list[dict[str, Any]] = []
        try:
            import cv2
        except ImportError:
            _templates_ready = True
            _templates = packed
            return packed

        for ch in dataset.collated_letters():
            path = dataset.pick_collated_image(ch)
            if not path:
                continue
            img = cv2.imread(str(path))
            gray = _prep_gray(img)
            if gray is None:
                continue
            packed.append(
                {
                    "label": ch,
                    "kind": "letter",
                    "gray": gray,
                }
            )

        for row in dataset.load_fsl_labels():
            thumb = dataset.extract_fsl_thumb(row["id"])
            if not thumb:
                continue
            img = cv2.imread(str(thumb))
            gray = _prep_gray(img)
            if gray is None:
                continue
            packed.append(
                {
                    "label": row["label"],
                    "kind": "fsl",
                    "id": row["id"],
                    "gray": gray,
                }
            )
        _templates = packed
        _templates_ready = True
        return packed


def _match_templates(frames: list[str]) -> tuple[str, float, str, int]:
    templates = _ensure_templates()
    if not templates:
        return "", 0.0, "", 0
    best_label, best_score, best_kind = "", -1.0, ""
    used = 0
    for raw in frames[-4:]:
        img = _decode_frame(raw)
        if img is None:
            continue
        gray = _prep_gray(img)
        if gray is None:
            continue
        used += 1
        for tmpl in templates:
            s = _ncc(gray, tmpl["gray"])
            if s > best_score:
                best_score = s
                best_label = tmpl["label"]
                best_kind = tmpl["kind"]
    # NCC on cluttered webcam vs studio clips is noisy — require a clear peak
    if best_score < 0.42:
        return "", 0.0, "", used
    conf = min(0.93, max(0.4, (best_score - 0.35) / 0.5))
    return best_label, conf, best_kind, used


def _is_point(pt: Any) -> bool:
    if isinstance(pt, dict) and "x" in pt:
        return True
    if isinstance(pt, (list, tuple)) and len(pt) >= 2 and isinstance(pt[0], (int, float)):
        return True
    return False


def _as_hand(payload: Any) -> Optional[list]:
    if not payload:
        return None
    if isinstance(payload, dict):
        for key in ("landmarks", "hand", "points"):
            if key in payload:
                return _as_hand(payload[key])
        return None
    if not isinstance(payload, list) or not payload:
        return None
    if _is_point(payload[0]) and len(payload) >= 21:
        return payload
    # One or more hands / frames
    inner = payload[0]
    if isinstance(inner, list) and inner and _is_point(inner[0]) and len(inner) >= 21:
        return inner
    if isinstance(inner, dict) and _is_point(inner):
        return payload if len(payload) >= 21 else None
    return _as_hand(inner)


def _iter_hands(landmarks=None, landmark_frames=None):
    blobs = []
    if landmark_frames:
        blobs.extend(list(landmark_frames)[-16:])
    elif landmarks:
        blobs.append(landmarks)
    for item in blobs:
        hand = _as_hand(item)
        if hand and len(hand) >= 21:
            yield hand


def recognize_from_landmarks(landmarks=None, landmark_frames=None) -> dict:
    votes: dict[str, list] = {}
    hands_n = 0
    for hand in _iter_hands(landmarks, landmark_frames):
        hands_n = 1
        label, conf, kind = classify_landmarks(hand)
        if not label:
            continue
        votes.setdefault(label, []).append((conf, kind))

    if not votes:
        return {
            "text": "",
            "confidence": 0.0,
            "message": "Hands tracked — hold a Collated letter or an FSL sign clearly.",
            "handsDetected": hands_n,
            "label": "",
            "source": "landmarks",
        }

    label, parts = max(votes.items(), key=lambda kv: (len(kv[1]), sum(c for c, _ in kv[1])))
    conf = sum(c for c, _ in parts) / len(parts)
    kind = parts[0][1]
    pretty = label.title() if kind == "letter" else label.title()
    if kind == "letter":
        pretty = label.upper()
        msg = f'Collated alphabet: "{pretty}"'
    else:
        pretty = label
        msg = f'FSL-105: "{pretty}"'
    return {
        "text": pretty,
        "confidence": round(float(conf), 3),
        "message": msg,
        "handsDetected": max(hands_n, 1),
        "label": label,
        "source": "landmarks",
        "kind": kind,
    }


def recognize_sign_from_frame(image_base64: str) -> dict:
    return recognize_sign_from_frames([image_base64] if image_base64 else [])


def recognize_sign_from_frames(frames: list[str]) -> dict:
    batch = [f for f in (frames or []) if f and len(f) > 50]
    if not batch:
        return {
            "text": "",
            "confidence": 0.0,
            "message": "No camera frame received.",
            "handsDetected": 0,
            "label": "empty",
        }
    label, conf, kind, used = _match_templates(batch)
    if not label:
        return {
            "text": "",
            "confidence": 0.0,
            "message": "No clear match yet — face the camera and sign from FSL-105 or fingerspell A–Z.",
            "handsDetected": 0 if used == 0 else 1,
            "label": "",
            "source": "fsl-105+collated",
            "framesUsed": used,
        }
    pretty = label.upper() if kind == "letter" else label
    msg = (
        f'Collated alphabet: "{pretty}"'
        if kind == "letter"
        else f'FSL-105: "{pretty}"'
    )
    return {
        "text": pretty,
        "confidence": round(float(conf), 3),
        "message": msg,
        "handsDetected": 1,
        "label": label,
        "source": "fsl-105+collated",
        "kind": kind,
        "framesUsed": used,
    }


def recognize_live(image_base64=None, frames=None, landmarks=None, landmark_frames=None) -> dict:
    lm_result = recognize_from_landmarks(landmarks, landmark_frames)
    if lm_result.get("text") and lm_result.get("confidence", 0) >= 0.58:
        return lm_result

    batch = [f for f in (frames or []) if f and len(f) > 50]
    if image_base64 and len(image_base64) > 50:
        batch.append(image_base64)
    vis = recognize_sign_from_frames(batch) if batch else {
        "text": "",
        "confidence": 0.0,
        "message": lm_result.get("message") or "Waiting for camera or hand landmarks.",
        "handsDetected": lm_result.get("handsDetected") or 0,
        "label": "",
    }
    if vis.get("text"):
        return vis
    return lm_result if lm_result.get("handsDetected") else vis
