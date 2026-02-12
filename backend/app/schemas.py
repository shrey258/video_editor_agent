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
