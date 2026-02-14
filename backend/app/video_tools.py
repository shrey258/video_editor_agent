from __future__ import annotations

import subprocess
from pathlib import Path
import math
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


def get_image_dimensions(image_path: Path) -> tuple[int, int]:
    output = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=s=x:p=0",
            str(image_path),
        ]
    )
    width_text, height_text = output.strip().split("x")
    return int(width_text), int(height_text)


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


def generate_sprite_sheets(
    input_path: Path,
    output_dir: Path,
    *,
    interval_sec: float = 1.0,
    columns: int = 10,
    rows: int = 10,
    thumb_width: int = 320,
) -> dict:
    duration_sec = get_duration_sec(input_path)
    interval_sec = max(0.1, float(interval_sec))
    columns = max(1, int(columns))
    rows = max(1, int(rows))
    thumb_width = max(64, int(thumb_width))

    total_frames = max(1, int(math.floor(duration_sec / interval_sec)) + 1)
    frames_per_sheet = columns * rows
    sheet_count = max(1, int(math.ceil(total_frames / frames_per_sheet)))

    output_dir.mkdir(parents=True, exist_ok=True)
    sheets: list[dict] = []

    for sheet_index in range(sheet_count):
        start_frame = sheet_index * frames_per_sheet
        frame_count = min(frames_per_sheet, total_frames - start_frame)
        start_time_sec = start_frame * interval_sec
        end_time_sec = min(duration_sec, (start_frame + frame_count - 1) * interval_sec)

        image_name = f"sheet_{sheet_index + 1:03d}.png"
        image_path = output_dir / image_name

        filter_graph = (
            f"fps=1/{interval_sec},"
            f"scale={thumb_width}:-1:flags=lanczos,"
            f"tile={columns}x{rows}:nb_frames={frame_count}"
        )

        _run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{start_time_sec:.3f}",
                "-i",
                str(input_path),
                "-an",
                "-sn",
                "-dn",
                "-frames:v",
                "1",
                "-vf",
                filter_graph,
                str(image_path),
            ]
        )

        image_width, image_height = get_image_dimensions(image_path)
        tile_width = image_width // columns
        tile_height = image_height // rows

        frames: list[dict] = []
        for i in range(frame_count):
            timestamp = min(duration_sec, (start_frame + i) * interval_sec)
            frames.append(
                {
                    "index": start_frame + i,
                    "timestamp_sec": round(timestamp, 3),
                    "row": i // columns,
                    "col": i % columns,
                }
            )

        sheets.append(
            {
                "sheet_index": sheet_index + 1,
                "image_name": image_name,
                "image_width": image_width,
                "image_height": image_height,
                "tile_width": tile_width,
                "tile_height": tile_height,
                "start_time_sec": round(start_time_sec, 3),
                "end_time_sec": round(end_time_sec, 3),
                "frames": frames,
            }
        )

    return {
        "duration_sec": round(duration_sec, 3),
        "interval_sec": interval_sec,
        "columns": columns,
        "rows": rows,
        "total_frames": total_frames,
        "sheets": sheets,
    }
