from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Dict
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .gemini_agent import parse_intent
from .schemas import (
    EditRequest,
    EditResponse,
    SpriteAnalysisResponse,
    TokenEstimateRequest,
    TokenEstimateResponse,
    UploadResponse,
)
from .validators import validate_trim
from .video_tools import (
    extract_range,
    generate_sprite_sheets,
    get_duration_sec,
    remove_segment_and_stitch,
)

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "backend" / ".env")
MEDIA_ROOT = (ROOT / os.getenv("MEDIA_ROOT", "media")).resolve()
UPLOAD_DIR = MEDIA_ROOT / "uploads"
OUTPUT_DIR = MEDIA_ROOT / "outputs"
SPRITES_DIR = MEDIA_ROOT / "sprites"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
SPRITES_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Video Editor Agent API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/media/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")
app.mount("/media/sprites", StaticFiles(directory=str(SPRITES_DIR)), name="sprites")

video_sessions: Dict[str, dict] = {}


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


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/upload", response_model=UploadResponse)
async def upload_video(file: UploadFile = File(...)) -> UploadResponse:
    max_mb = int(os.getenv("MAX_FILE_SIZE_MB", "500"))
    body = await file.read()
    if len(body) > max_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {max_mb} MB")

    suffix = Path(file.filename or "upload.mp4").suffix or ".mp4"
    filename = f"{uuid4()}{suffix}"
    save_path = UPLOAD_DIR / filename
    save_path.write_bytes(body)

    try:
        duration = get_duration_sec(save_path)
    except Exception as exc:
        save_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Invalid media file: {exc}") from exc

    video_id = str(uuid4())
    video_sessions[video_id] = {
        "input_path": save_path,
        "duration_sec": duration,
        "filename": filename,
    }
    return UploadResponse(
        video_id=video_id,
        source_url=f"/media/uploads/{filename}",
        duration_sec=duration,
        filename=filename,
    )


@app.post("/edit-request", response_model=EditResponse)
async def edit_request(payload: EditRequest) -> EditResponse:
    session = video_sessions.get(payload.video_id)
    if not session:
        raise HTTPException(status_code=404, detail="Unknown video_id")

    duration = float(session["duration_sec"])
    try:
        intent = await parse_intent(payload.prompt, duration)
        if intent["action"] != "trim_video":
            raise ValueError("Only trim_video is supported in v0.")
        operation = intent.get("operation", "remove_segment")
        if operation not in {"remove_segment", "extract_range"}:
            raise ValueError(f"Unsupported trim operation: {operation}")
        start_sec = float(intent["start_sec"])
        end_sec = float(intent["end_sec"])
        validate_trim(start_sec, end_sec, duration)
        if operation == "remove_segment":
            # Removing the full duration would produce an empty file.
            if start_sec <= 0 and end_sec >= duration:
                raise ValueError("Cannot remove the entire video range.")
            output_path = remove_segment_and_stitch(
                input_path=Path(session["input_path"]),
                output_dir=OUTPUT_DIR,
                start_sec=start_sec,
                end_sec=end_sec,
            )
        else:
            output_path = extract_range(
                input_path=Path(session["input_path"]),
                output_dir=OUTPUT_DIR,
                start_sec=start_sec,
                end_sec=end_sec,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return EditResponse(
        action="trim_video",
        operation=operation,
        reason=intent.get("reason", "Applied trim."),
        output={
            "start_sec": start_sec,
            "end_sec": end_sec,
            "output_url": f"/media/outputs/{output_path.name}",
            "output_name": output_path.name,
        },
    )


@app.post("/analyze/sprites", response_model=SpriteAnalysisResponse)
async def analyze_sprites(
    file: UploadFile = File(...),
    interval_sec: float = Form(1.0),
    columns: int = Form(10),
    rows: int = Form(10),
    thumb_width: int = Form(320),
) -> SpriteAnalysisResponse:
    if interval_sec <= 0:
        raise HTTPException(status_code=400, detail="interval_sec must be greater than 0.")
    if columns <= 0 or rows <= 0:
        raise HTTPException(status_code=400, detail="columns and rows must be greater than 0.")

    suffix = Path(file.filename or "upload.mp4").suffix or ".mp4"
    upload_name = f"{uuid4()}{suffix}"
    upload_path = UPLOAD_DIR / upload_name
    upload_path.write_bytes(await file.read())

    sprite_job_id = str(uuid4())
    sprite_output_dir = SPRITES_DIR / sprite_job_id

    try:
        analysis = generate_sprite_sheets(
            input_path=upload_path,
            output_dir=sprite_output_dir,
            interval_sec=interval_sec,
            columns=columns,
            rows=rows,
            thumb_width=thumb_width,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Sprite analysis failed: {exc}") from exc

    sheets = []
    for sheet in analysis["sheets"]:
        sheets.append(
            {
                "sheet_index": sheet["sheet_index"],
                "image_url": f"/media/sprites/{sprite_job_id}/{sheet['image_name']}",
                "image_width": sheet["image_width"],
                "image_height": sheet["image_height"],
                "tile_width": sheet["tile_width"],
                "tile_height": sheet["tile_height"],
                "start_time_sec": sheet["start_time_sec"],
                "end_time_sec": sheet["end_time_sec"],
                "frames": sheet["frames"],
            }
        )

    return SpriteAnalysisResponse(
        duration_sec=analysis["duration_sec"],
        interval_sec=analysis["interval_sec"],
        columns=analysis["columns"],
        rows=analysis["rows"],
        total_frames=analysis["total_frames"],
        sheets=sheets,
    )


@app.post("/analyze/token-estimate", response_model=TokenEstimateResponse)
def analyze_token_estimate(payload: TokenEstimateRequest) -> TokenEstimateResponse:
    return estimate_tokens(
        duration_sec=payload.duration_sec,
        interval_sec=payload.interval_sec,
        columns=payload.columns,
        rows=payload.rows,
        thumb_width=payload.thumb_width,
    )


@app.post("/analyze/token-estimate-from-file", response_model=TokenEstimateResponse)
async def analyze_token_estimate_from_file(
    file: UploadFile = File(...),
    interval_sec: float = Form(1.0),
    columns: int = Form(8),
    rows: int = Form(8),
    thumb_width: int = Form(256),
) -> TokenEstimateResponse:
    if interval_sec <= 0:
        raise HTTPException(status_code=400, detail="interval_sec must be greater than 0.")
    if columns <= 0 or rows <= 0:
        raise HTTPException(status_code=400, detail="columns and rows must be greater than 0.")

    suffix = Path(file.filename or "upload.mp4").suffix or ".mp4"
    filename = f"{uuid4()}{suffix}"
    save_path = UPLOAD_DIR / filename
    save_path.write_bytes(await file.read())

    try:
        duration_sec = get_duration_sec(save_path)
    except Exception as exc:
        save_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Invalid media file: {exc}") from exc

    return estimate_tokens(
        duration_sec=duration_sec,
        interval_sec=interval_sec,
        columns=columns,
        rows=rows,
        thumb_width=thumb_width,
    )


@app.exception_handler(Exception)
async def fallback_exception_handler(_request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})
