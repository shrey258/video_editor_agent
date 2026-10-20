"""Experiment: let Jev look at sampled frames and cut the ones it flags.

Usage (from backend/):
    .venv/bin/python scripts/jev_cut.py <video.mp4> [--cut "what to cut"] [--every 0.5] [--threshold 0.5]
"""
from __future__ import annotations

import argparse
import base64
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
from app.video_tools import get_duration_sec, remove_segments_and_stitch  # noqa: E402

JEV_URL = "https://api.typesafe.ai/v1/systemone"
DEFAULT_CUT = "black, blank, blurry, or shows nothing of interest compared to the other frames"


def extract_frames(video: Path, every: float, out_dir: Path) -> list[tuple[float, Path]]:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"fps=1/{every},scale=w=320:h=320:force_original_aspect_ratio=increase:force_divisible_by=2", "-q:v", "4", str(out_dir / "f%04d.jpg")],
        check=True,
    )
    return [(i * every, p) for i, p in enumerate(sorted(out_dir.glob("f*.jpg")))]


def ask_jev(frames: list[tuple[float, Path]], cut: str, api_key: str) -> dict[float, float]:
    state, assets, questions = {}, {}, {}
    for t, path in frames:
        key, ref = f"t{t:05.1f}".replace(".", "_"), f"img-{uuid.uuid4()}"
        state[key] = ref
        assets[ref] = {"type": "image", "format": "jpg", "data_base64": base64.b64encode(path.read_bytes()).decode()}
        questions[key] = {
            "type": "noul",
            "instructions": f"The state holds frames of one short video, keyed by timestamp. "
            f"Should a video editor cut the frame `{key}` because it is {cut}?",
        }
    resp = httpx.post(
        JEV_URL,
        headers={"Authorization": f"Bearer {api_key}", "TypeSafe-Danger-Zone-Images": "true"},
        json={"model": "jev-1.14.0", "state": state, "assets": assets, "questions": questions},
        timeout=120,
    )
    if resp.status_code != 200:
        sys.exit(f"Jev {resp.status_code}: {resp.text[:500]}")
    body = resp.json()
    print(f"model={body.get('model')} usage={body.get('usage')}")
    return {t: body["answers"][f"t{t:05.1f}".replace(".", "_")]["noul"] for t, _ in frames}


def to_trim_ranges(scores: dict[float, float], every: float, threshold: float, duration: float) -> list[tuple[float, float]]:
    ranges: list[tuple[float, float]] = []
    for t in sorted(scores):
        if scores[t] < threshold:
            continue
        end = min(t + every, duration)
        if ranges and abs(ranges[-1][1] - t) < 1e-6:
            ranges[-1] = (ranges[-1][0], end)
        else:
            ranges.append((t, end))
    return ranges


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("--cut", default=DEFAULT_CUT, help="finishes the sentence 'cut the frame because it is ...'")
    parser.add_argument("--every", type=float, default=0.5)
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args()

    load_dotenv(BACKEND_ROOT / ".env")
    api_key = os.getenv("TYPESAFE_API_KEY") or sys.exit("TYPESAFE_API_KEY missing from backend/.env")
    duration = get_duration_sec(args.video)

    with tempfile.TemporaryDirectory() as tmp:
        frames = extract_frames(args.video, args.every, Path(tmp))
        scores = ask_jev(frames, args.cut, api_key)

    for t, p in sorted(scores.items()):
        print(f"{t:5.1f}s  {p:.2f}  {'CUT' if p >= args.threshold else ''}")

    ranges = to_trim_ranges(scores, args.every, args.threshold, duration)
    if not ranges:
        sys.exit("Jev flagged nothing; no edit made.")
    if sum(e - s for s, e in ranges) >= duration - 0.1:
        sys.exit("Jev flagged the whole video; refusing to cut everything.")
    print("trim ranges:", [(round(s, 2), round(e, 2)) for s, e in ranges])
    out = remove_segments_and_stitch(
        input_path=args.video, output_dir=Path(tempfile.gettempdir()) / "jev_out", duration_sec=duration, trim_ranges=ranges
    )
    print(f"output: {out}  ({get_duration_sec(out):.2f}s, was {duration:.2f}s)")


if __name__ == "__main__":
    assert to_trim_ranges({0.0: 0.9, 0.5: 0.8, 1.0: 0.1, 1.5: 0.7}, 0.5, 0.5, 1.8) == [(0.0, 1.0), (1.5, 1.8)]
    main()
