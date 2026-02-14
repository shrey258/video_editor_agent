import os

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_token_estimate_endpoint_returns_comparison():
    response = client.post(
        "/analyze/token-estimate",
        json={
            "duration_sec": 120,
            "interval_sec": 1.0,
            "columns": 8,
            "rows": 8,
            "thumb_width": 256,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["duration_sec"] == 120
    assert data["direct_video_tokens_est"] > 0
    assert data["sprite_tokens_est"] > 0
    assert "recommendation" in data


def test_token_estimate_rejects_invalid_duration():
    response = client.post(
        "/analyze/token-estimate",
        json={
            "duration_sec": 0,
            "interval_sec": 1.0,
            "columns": 8,
            "rows": 8,
            "thumb_width": 256,
        },
    )
    assert response.status_code == 422


def test_suggest_cuts_fallback_explicit_range(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = client.post(
        "/ai/suggest-cuts-from-sprites",
        json={
            "prompt": "Cut from 4 to 5 seconds",
            "duration_sec": 20,
            "sprite_interval_sec": 1.0,
            "total_frames": 21,
            "sheets_count": 1,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["model"] == "fallback"
    assert data["strategy"] == "rule-based"
    assert len(data["suggestions"]) >= 1
    first = data["suggestions"][0]
    assert first["start_sec"] == 4
    assert first["end_sec"] == 5

