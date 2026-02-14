from __future__ import annotations

import math

from ..schemas import TokenEstimateResponse


def estimate_tokens(
    *,
    duration_sec: float,
    interval_sec: float,
    columns: int,
    rows: int,
    thumb_width: int,
) -> TokenEstimateResponse:
    total_frames = max(1, int(math.floor(duration_sec / interval_sec)) + 1)
    frames_per_sheet = max(1, columns * rows)
    sheet_count = max(1, int(math.ceil(total_frames / frames_per_sheet)))

    # Heuristic estimates for planning only (not exact provider billing numbers).
    direct_video_tokens_est = int(duration_sec * 180 + 400)
    per_frame_tokens = max(45, int(85 * (thumb_width / 256)))
    sprite_tokens_est = int(total_frames * per_frame_tokens + sheet_count * 40 + 250)

    ratio = sprite_tokens_est / max(direct_video_tokens_est, 1)
    if ratio <= 0.7:
        recommendation = "Sprites are likely more token-efficient than direct video upload."
    elif ratio <= 1.1:
        recommendation = "Sprites and direct upload are in a similar token range."
    else:
        recommendation = (
            "Direct video upload may be more token-efficient for this configuration."
        )

    return TokenEstimateResponse(
        duration_sec=round(duration_sec, 3),
        direct_video_tokens_est=direct_video_tokens_est,
        sprite_tokens_est=sprite_tokens_est,
        total_frames=total_frames,
        sheet_count=sheet_count,
        recommendation=recommendation,
        notes=[
            "Estimates are heuristic and model-dependent.",
            "Increase interval_sec or lower thumb_width to reduce sprite tokens.",
            "Use sprites for controllability/provider portability; use direct upload for temporal richness.",
        ],
    )
