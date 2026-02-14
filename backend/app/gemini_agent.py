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


def _fallback_suggest_cuts(prompt: str, duration_sec: float) -> list[dict]:
    lowered = prompt.lower()
    matches = re.findall(r"(?:from|between)\s+([0-9:.]+)\s+(?:to|and|-)\s+([0-9:.]+)", lowered)
    if matches:
        suggestions = []
        for start_raw, end_raw in matches:
            start_sec = parse_time_like(start_raw)
            end_sec = parse_time_like(end_raw)
            if 0 <= start_sec < end_sec <= duration_sec:
                suggestions.append(
                    {
                        "start_sec": start_sec,
                        "end_sec": end_sec,
                        "reason": "Parsed explicit range from prompt.",
                        "confidence": 0.9,
                    }
                )
        if suggestions:
            return suggestions

    if "recommend" in lowered or "suggest" in lowered:
        segment = max(0.5, duration_sec * 0.08)
        points = [duration_sec * 0.22, duration_sec * 0.5, duration_sec * 0.78]
        suggestions = []
        for p in points:
            start_sec = max(0.0, p - segment / 2)
            end_sec = min(duration_sec, start_sec + segment)
            if end_sec - start_sec >= 0.3:
                suggestions.append(
                    {
                        "start_sec": round(start_sec, 3),
                        "end_sec": round(end_sec, 3),
                        "reason": "Fallback recommendation window.",
                        "confidence": 0.45,
                    }
                )
        return suggestions[:3]

    return []


async def suggest_cuts_from_sprites(
    *,
    prompt: str,
    duration_sec: float,
    sprite_interval_sec: float,
    total_frames: int,
    sheets_count: int,
) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    print(
        "SUGGEST_CUTS_REQUEST:",
        {
            "duration_sec": duration_sec,
            "sprite_interval_sec": sprite_interval_sec,
            "total_frames": total_frames,
            "sheets_count": sheets_count,
            "prompt": prompt,
        },
    )
    if not api_key:
        fallback = {
            "model": "fallback",
            "strategy": "rule-based",
            "suggestions": _fallback_suggest_cuts(prompt, duration_sec),
        }
        print("SUGGEST_CUTS_FALLBACK_RESPONSE:", fallback)
        return fallback

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={api_key}"
    )

    instructions = (
        "You are an editing planner. Return strict JSON only.\n"
        "Schema: {\"suggestions\":[{\"start_sec\":number,\"end_sec\":number,\"reason\":string,\"confidence\":number}]}\n"
        f"Video duration: {duration_sec:.3f}s\n"
        f"Sprite analysis summary: interval={sprite_interval_sec}s, total_frames={total_frames}, sheets={sheets_count}\n"
        "Rules:\n"
        "- Produce 0 to 8 suggestions.\n"
        "- Each suggestion must satisfy 0 <= start_sec < end_sec <= duration.\n"
        "- Confidence range 0..1\n"
        "- If prompt asks recommendation, infer likely removable boring/dead sections.\n"
        "- If prompt gives explicit ranges, prioritize those.\n"
    )

    payload = {
        "contents": [{"parts": [{"text": f"{instructions}\nUser prompt: {prompt}"}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    print("GEMINI_RAW_SUGGEST_RESPONSE:", text)
    parsed = _extract_json(text)
    raw_suggestions = parsed.get("suggestions", [])

    normalized: list[dict] = []
    for item in raw_suggestions:
        try:
            start_sec = parse_time_like(item["start_sec"])
            end_sec = parse_time_like(item["end_sec"])
        except Exception:
            continue
        if not (0 <= start_sec < end_sec <= duration_sec):
            continue
        confidence_raw = item.get("confidence", 0.5)
        try:
            confidence = float(confidence_raw)
        except Exception:
            confidence = 0.5
        normalized.append(
            {
                "start_sec": round(start_sec, 3),
                "end_sec": round(end_sec, 3),
                "reason": str(item.get("reason", "Model suggestion")),
                "confidence": max(0.0, min(1.0, confidence)),
            }
        )

    if not normalized:
        normalized = _fallback_suggest_cuts(prompt, duration_sec)

    result = {
        "model": "gemini-2.0-flash",
        "strategy": "sprite-summary-prompt",
        "suggestions": normalized,
    }
    print("SUGGEST_CUTS_NORMALIZED_RESPONSE:", result)
    return result
