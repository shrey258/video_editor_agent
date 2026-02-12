from __future__ import annotations

import json
import os
import re

import httpx

from .validators import parse_time_like


def _extract_json(text: str) -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("No JSON object in model output.")
    return json.loads(text[start : end + 1])


def _regex_fallback(prompt: str) -> dict:
    lowered = prompt.lower()
    m = re.search(r"(?:from|between)\s+([0-9:.]+)\s+(?:to|and|-)\s+([0-9:.]+)", lowered)
    if not m:
        raise ValueError("Could not parse prompt without Gemini API key.")
    start_raw, end_raw = m.groups()
    operation = "extract_range" if "keep only" in lowered else "remove_segment"
    return {
        "action": "trim_video",
        "operation": operation,
        "start_sec": parse_time_like(start_raw),
        "end_sec": parse_time_like(end_raw),
        "reason": "Parsed from explicit range in prompt.",
    }


async def parse_intent(prompt: str, duration_sec: float) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return _regex_fallback(prompt)

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={api_key}"
    )
    instructions = (
        "Return JSON only with this schema: "
        '{"action":"trim_video","operation":"remove_segment|extract_range","start_sec":number,"end_sec":number,"reason":string}. '
        f"Times must be within 0 and {duration_sec:.3f}. "
        "Interpretation rules: if user says trim/cut/delete/remove from X to Y, set operation=remove_segment. "
        "If user says keep only/highlight/extract from X to Y, set operation=extract_range."
    )
    payload = {
        "contents": [{"parts": [{"text": f"{instructions}\nUser prompt: {prompt}"}]}],
        "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    parsed = _extract_json(text)
    return {
        "action": parsed.get("action", "trim_video"),
        "operation": parsed.get("operation", "remove_segment"),
        "start_sec": parse_time_like(parsed["start_sec"]),
        "end_sec": parse_time_like(parsed["end_sec"]),
        "reason": parsed.get("reason", "Parsed by Gemini."),
    }
