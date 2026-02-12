from __future__ import annotations

import subprocess
from pathlib import Path
from uuid import uuid4


def _run(cmd: list[str]) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout


def get_duration_sec(input_path: Path) -> float:
    output = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(input_path),
        ]
    )
    duration = float(output.strip())
    if duration <= 0:
        raise RuntimeError("Invalid duration from ffprobe.")
    return duration


def has_audio_stream(input_path: Path) -> bool:
    output = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(input_path),
        ]
    )
    return bool(output.strip())


def extract_range(input_path: Path, output_dir: Path, start_sec: float, end_sec: float) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{uuid4()}.mp4"
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(input_path),
            "-ss",
            f"{start_sec:.3f}",
            "-to",
            f"{end_sec:.3f}",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-c:a",
            "aac",
            str(output_path),
        ]
    )
    return output_path


def remove_segment_and_stitch(
    input_path: Path, output_dir: Path, start_sec: float, end_sec: float
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{uuid4()}.mp4"

    if has_audio_stream(input_path):
        filter_complex = (
            f"[0:v]trim=0:{start_sec:.3f},setpts=PTS-STARTPTS[v0];"
            f"[0:v]trim=start={end_sec:.3f},setpts=PTS-STARTPTS[v1];"
            f"[0:a]atrim=0:{start_sec:.3f},asetpts=PTS-STARTPTS[a0];"
            f"[0:a]atrim=start={end_sec:.3f},asetpts=PTS-STARTPTS[a1];"
            "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]"
        )
        _run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(input_path),
                "-filter_complex",
                filter_complex,
                "-map",
                "[v]",
                "-map",
                "[a]",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "18",
                "-c:a",
                "aac",
                str(output_path),
            ]
        )
    else:
        filter_complex = (
            f"[0:v]trim=0:{start_sec:.3f},setpts=PTS-STARTPTS[v0];"
            f"[0:v]trim=start={end_sec:.3f},setpts=PTS-STARTPTS[v1];"
            "[v0][v1]concat=n=2:v=1:a=0[v]"
        )
        _run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(input_path),
                "-filter_complex",
                filter_complex,
                "-map",
                "[v]",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "18",
                str(output_path),
            ]
        )

    return output_path
