from typing import Annotated, Literal, Optional, Union

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
    interval_sec: float = Field(default=0.25, gt=0)
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


class EditSuggestion(BaseModel):
    action: Literal["trim_video", "speed_video"] = "trim_video"
    operation: Literal["remove_segment", "extract_range", "apply_speed_range"] = "remove_segment"
    start_sec: float
    end_sec: float
    reason: str
    confidence: float = 0.5
    speed_multiplier: Optional[float] = None


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class SpeedRangeInput(BaseModel):
    start: float
    end: float
    speed: float


class TrimRange(BaseModel):
    start: float
    end: float


class SuggestCutsRequest(BaseModel):
    prompt: str = Field(min_length=1)
    duration_sec: float = Field(gt=0)
    sprite_interval_sec: float = Field(gt=0)
    total_frames: int = Field(gt=0)
    sheets_count: int = Field(gt=0)
    chat_history: list[ChatTurn] = Field(default_factory=list)
    conversation_summary: Optional[str] = None
    trim_ranges: list[TrimRange] = Field(default_factory=list)
    speed_ranges: list[SpeedRangeInput] = Field(default_factory=list)


class SuggestCutsResponse(BaseModel):
    suggestions: list[EditSuggestion]
    model: str
    strategy: str


class ExportResponse(BaseModel):
    output_url: str
    output_name: str
    removed_ranges_count: int


class ZoomEffect(BaseModel):
    kind: Literal["zoom"]
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    scale: float = Field(ge=1, le=5)
    cx: float = Field(ge=0, le=1)
    cy: float = Field(ge=0, le=1)


class TextEffect(BaseModel):
    # The browser renders the text into a full-frame transparent PNG; `overlay` indexes the uploaded files.
    kind: Literal["text"]
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    overlay: int = Field(ge=0)


class BlurEffect(BaseModel):
    kind: Literal["blur"]
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


Effect = Annotated[Union[ZoomEffect, TextEffect, BlurEffect], Field(discriminator="kind")]


class FrameStyle(BaseModel):
    aspect: Literal["native", "16:9", "9:16", "1:1", "4:3", "4:5"] = "native"
    colors: list[Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]] = Field(default_factory=lambda: ["#000000"], min_length=1, max_length=2)
    padding: float = Field(default=0, ge=0, le=30)
    radius: float = Field(default=0, ge=0, le=25)
    shadow: bool = False

    def is_plain(self) -> bool:
        return self.aspect == "native" and self.padding == 0 and self.radius == 0 and not self.shadow
