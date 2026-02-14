from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    video_id: str
    source_url: str
    duration_sec: float
    filename: str


class EditRequest(BaseModel):
    video_id: str = Field(min_length=1)
    prompt: str = Field(min_length=1)


class EditOutput(BaseModel):
    start_sec: float
    end_sec: float
    output_url: str
    output_name: str


class EditResponse(BaseModel):
    action: str
    operation: str
    reason: str
    output: EditOutput


class SpriteFrame(BaseModel):
    index: int
    timestamp_sec: float
    row: int
    col: int


class SpriteSheet(BaseModel):
    sheet_index: int
    image_url: str
    image_width: int
    image_height: int
    tile_width: int
    tile_height: int
    start_time_sec: float
    end_time_sec: float
    frames: list[SpriteFrame]


class SpriteAnalysisResponse(BaseModel):
    duration_sec: float
    interval_sec: float
    columns: int
    rows: int
    total_frames: int
    sheets: list[SpriteSheet]


class TokenEstimateRequest(BaseModel):
    duration_sec: float = Field(gt=0)
    interval_sec: float = Field(default=1.0, gt=0)
    columns: int = Field(default=8, gt=0)
    rows: int = Field(default=8, gt=0)
    thumb_width: int = Field(default=256, ge=64)


class TokenEstimateResponse(BaseModel):
    duration_sec: float
    direct_video_tokens_est: int
    sprite_tokens_est: int
    total_frames: int
    sheet_count: int
    recommendation: str
    notes: list[str]
