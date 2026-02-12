from __future__ import annotations

import os
from pathlib import Path
from typing import Dict
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .gemini_agent import parse_intent
from .schemas import EditRequest, EditResponse, UploadResponse
from .validators import validate_trim
from .video_tools import extract_range, get_duration_sec, remove_segment_and_stitch

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "backend" / ".env")
MEDIA_ROOT = (ROOT / os.getenv("MEDIA_ROOT", "media")).resolve()
UPLOAD_DIR = MEDIA_ROOT / "uploads"
OUTPUT_DIR = MEDIA_ROOT / "outputs"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

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

video_sessions: Dict[str, dict] = {}


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


@app.exception_handler(Exception)
async def fallback_exception_handler(_request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})
