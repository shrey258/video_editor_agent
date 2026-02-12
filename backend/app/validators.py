from __future__ import annotations

import re


def parse_time_like(value: object) -> float:
    if isinstance(value, (int, float)):
        return float(value)

    if not isinstance(value, str):
        raise ValueError("Invalid time value type.")

    text = value.strip()
    if not text:
        raise ValueError("Empty time value.")

    if re.fullmatch(r"\d+(\.\d+)?", text):
        return float(text)

    hhmmss = re.fullmatch(r"(\d{1,2}):([0-5]?\d):([0-5]?\d(?:\.\d+)?)", text)
    if hhmmss:
        h, m, s = hhmmss.groups()
        return float(h) * 3600 + float(m) * 60 + float(s)

    mmss = re.fullmatch(r"([0-5]?\d):([0-5]?\d(?:\.\d+)?)", text)
    if mmss:
        m, s = mmss.groups()
        return float(m) * 60 + float(s)

    raise ValueError(f"Unsupported time format: {value}")


def validate_trim(start_sec: float, end_sec: float, duration_sec: float) -> None:
    if start_sec < 0 or end_sec < 0:
        raise ValueError("Start and end must be non-negative.")
    if start_sec >= end_sec:
        raise ValueError("End must be greater than start.")
    if end_sec > duration_sec:
        raise ValueError(
            f"End ({end_sec:.3f}s) exceeds duration ({duration_sec:.3f}s)."
        )
