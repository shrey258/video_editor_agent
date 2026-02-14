from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Dict
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .gemini_agent import parse_intent, suggest_cuts_from_sprites
from .schemas import (
    EditRequest,
    EditResponse,
    ExportResponse,
    SuggestCutsRequest,
    SuggestCutsResponse,
    SpriteAnalysisResponse,
    TokenEstimateRequest,
    TokenEstimateResponse,
    TrimRange,
    UploadResponse,
)
from .services.media_service import (
    probe_duration_or_cleanup,
    save_upload_file,
    validate_sprite_params,
)
from .services.token_service import estimate_tokens
from .validators import validate_trim
from .video_tools import (
    extract_range,
    generate_sprite_sheets,
    get_duration_sec,
    remove_segments_and_stitch,
    remove_segment_and_stitch,
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_ROOT / ".env")
MEDIA_ROOT = (BACKEND_ROOT / os.getenv("MEDIA_ROOT", "media")).resolve()
UPLOAD_DIR = MEDIA_ROOT / "uploads"
OUTPUT_DIR = MEDIA_ROOT / "outputs"
SPRITES_DIR = MEDIA_ROOT / "sprites"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
SPRITES_DIR.mkdir(parents=True, exist_ok=True)


def _allowed_origins() -> list[str]:
    origins = {"http://localhost:3000", "http://127.0.0.1:3000"}
    env_origins = os.getenv("CORS_ORIGINS", "")
    if env_origins.strip():
        for origin in env_origins.split(","):
            cleaned = origin.strip().rstrip("/")
            if cleaned:
                origins.add(cleaned)
    vercel_frontend_url = os.getenv("VERCEL_FRONTEND_URL", "").strip().rstrip("/")
    if vercel_frontend_url:
        origins.add(vercel_frontend_url)
    return sorted(origins)


app = FastAPI(title="Video Editor Agent API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/media/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")
app.mount("/media/sprites", StaticFiles(directory=str(SPRITES_DIR)), name="sprites")

video_sessions: Dict[str, dict] = {}


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/upload", response_model=UploadResponse)
async def upload_video(file: UploadFile = File(...)) -> UploadResponse:
    max_mb = int(os.getenv("MAX_FILE_SIZE_MB", "500"))
    try:
        save_path = await save_upload_file(
            file=file, upload_dir=UPLOAD_DIR, max_file_size_mb=max_mb
        )
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc

    try:
        duration = probe_duration_or_cleanup(save_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    video_id = str(uuid4())
    filename = save_path.name
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
    try:
        validate_sprite_params(interval_sec, columns, rows)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    upload_path = await save_upload_file(file=file, upload_dir=UPLOAD_DIR)
    persist_sprites = os.getenv("SPRITE_PERSIST", "false").strip().lower() == "true"
    sprite_job_id = str(uuid4())

    try:
        if persist_sprites:
            sprite_output_dir = SPRITES_DIR / sprite_job_id
            analysis = generate_sprite_sheets(
                input_path=upload_path,
                output_dir=sprite_output_dir,
                interval_sec=interval_sec,
                columns=columns,
                rows=rows,
                thumb_width=thumb_width,
            )
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
        else:
            with tempfile.TemporaryDirectory(prefix="sprite_job_") as temp_dir:
                analysis = generate_sprite_sheets(
                    input_path=upload_path,
                    output_dir=Path(temp_dir),
                    interval_sec=interval_sec,
                    columns=columns,
                    rows=rows,
                    thumb_width=thumb_width,
                )
            # No persisted files in non-persistent mode.
            sheets = []
            for sheet in analysis["sheets"]:
                sheets.append(
                    {
                        "sheet_index": sheet["sheet_index"],
                        "image_url": "",
                        "image_width": sheet["image_width"],
                        "image_height": sheet["image_height"],
                        "tile_width": sheet["tile_width"],
                        "tile_height": sheet["tile_height"],
                        "start_time_sec": sheet["start_time_sec"],
                        "end_time_sec": sheet["end_time_sec"],
                        "frames": sheet["frames"],
                    }
                )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Sprite analysis failed: {exc}") from exc
    finally:
        upload_path.unlink(missing_ok=True)

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
    try:
        validate_sprite_params(interval_sec, columns, rows)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    save_path = await save_upload_file(file=file, upload_dir=UPLOAD_DIR)

    try:
        try:
            duration_sec = probe_duration_or_cleanup(save_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return estimate_tokens(
            duration_sec=duration_sec,
            interval_sec=interval_sec,
            columns=columns,
            rows=rows,
            thumb_width=thumb_width,
        )
    finally:
        save_path.unlink(missing_ok=True)


@app.post("/ai/suggest-cuts-from-sprites", response_model=SuggestCutsResponse)
async def ai_suggest_cuts_from_sprites(payload: SuggestCutsRequest) -> SuggestCutsResponse:
    try:
        result = await suggest_cuts_from_sprites(
            prompt=payload.prompt,
            duration_sec=payload.duration_sec,
            sprite_interval_sec=payload.sprite_interval_sec,
            total_frames=payload.total_frames,
            sheets_count=payload.sheets_count,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return SuggestCutsResponse(
        suggestions=result["suggestions"],
        model=result["model"],
        strategy=result["strategy"],
    )


@app.post("/export/from-file", response_model=ExportResponse)
async def export_from_file(
    file: UploadFile = File(...),
    trim_ranges: str = Form(default="[]"),
) -> ExportResponse:
    max_mb = int(os.getenv("MAX_FILE_SIZE_MB", "500"))
    try:
        input_path = await save_upload_file(
            file=file, upload_dir=UPLOAD_DIR, max_file_size_mb=max_mb
        )
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc

    try:
        duration_sec = probe_duration_or_cleanup(input_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        raw_ranges = json.loads(trim_ranges)
        parsed_ranges = [TrimRange.model_validate(item) for item in raw_ranges]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid trim_ranges JSON: {exc}") from exc

    normalized_ranges: list[tuple[float, float]] = []
    for item in parsed_ranges:
        start_sec = float(min(item.start, item.end))
        end_sec = float(max(item.start, item.end))
        validate_trim(start_sec, end_sec, duration_sec)
        normalized_ranges.append((start_sec, end_sec))

    normalized_ranges.sort(key=lambda x: x[0])
    merged_ranges: list[tuple[float, float]] = []
    for start_sec, end_sec in normalized_ranges:
        if not merged_ranges:
            merged_ranges.append((start_sec, end_sec))
            continue
        last_start, last_end = merged_ranges[-1]
        if start_sec <= last_end:
            merged_ranges[-1] = (last_start, max(last_end, end_sec))
        else:
            merged_ranges.append((start_sec, end_sec))

    if merged_ranges and merged_ranges[0][0] <= 0 and merged_ranges[-1][1] >= duration_sec:
        # Entire timeline removed after merge.
        only_removed = len(merged_ranges) == 1 and merged_ranges[0][0] <= 0 and merged_ranges[0][1] >= duration_sec
        if only_removed:
            raise HTTPException(status_code=400, detail="Cannot remove the entire video range.")

    try:
        try:
            if merged_ranges:
                output_path = remove_segments_and_stitch(
                    input_path=input_path,
                    output_dir=OUTPUT_DIR,
                    duration_sec=duration_sec,
                    trim_ranges=merged_ranges,
                )
            else:
                # No trims: produce a normal export copy by re-encoding the full source range.
                output_path = extract_range(
                    input_path=input_path,
                    output_dir=OUTPUT_DIR,
                    start_sec=0.0,
                    end_sec=duration_sec,
                )
            # Sanity check output can be probed.
            _ = get_duration_sec(output_path)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Export failed: {exc}") from exc
    finally:
        input_path.unlink(missing_ok=True)

    return ExportResponse(
        output_url=f"/media/outputs/{output_path.name}",
        output_name=output_path.name,
        removed_ranges_count=len(merged_ranges),
    )


@app.exception_handler(Exception)
async def fallback_exception_handler(_request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})
