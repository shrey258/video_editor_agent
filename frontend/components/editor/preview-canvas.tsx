"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { useVideo } from "./video-context";
import { zoomAt, zoomTransform, type Effect, type FrameStyle } from "./video-store";

const ASPECTS: Record<string, number> = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:3": 4 / 3, "4:5": 4 / 5 };

export function frameBackground(frame: FrameStyle): string {
    return frame.colors.length === 2
        ? `linear-gradient(to bottom right, ${frame.colors[0]}, ${frame.colors[1]})`
        : frame.colors[0];
}

/** Drag with the pointer; reports movement as fractions of `box`. */
function startDrag(e: ReactPointerEvent, box: HTMLElement | null, onMove: (dx: number, dy: number) => void) {
    if (!box) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = box.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const move = (ev: PointerEvent) => onMove((ev.clientX - x0) / rect.width, (ev.clientY - y0) / rect.height);
    const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * The preview: background frame, the video at its own aspect, and live zoom/text/blur.
 * Layout, easing and positions match `apply_effects` in backend/app/video_tools.py.
 */
export function PreviewCanvas() {
    const { videoRef, videoSrc, currentTime, isPlaying, effects, selectedEffectId, frame, updateEffect, selectEffect } =
        useVideo();
    const [videoAspect, setVideoAspect] = useState(16 / 9);
    const [videoBox, setVideoBox] = useState<HTMLDivElement | null>(null);

    const isPlain = frame.aspect === "native" && frame.padding === 0 && frame.radius === 0 && !frame.shadow;
    const canvasAspect = ASPECTS[frame.aspect] ?? videoAspect;
    const selected = effects.find((e) => e.id === selectedEffectId);
    // While aiming a zoom, show the whole frame with the zoom window drawn on it.
    const aimingZoom = selected?.kind === "zoom" && !isPlaying;
    const zoom = aimingZoom ? { scale: 1, cx: 0.5, cy: 0.5 } : zoomAt(effects, currentTime);
    const isVisible = (e: Effect) => e.id === selectedEffectId || (currentTime >= e.start && currentTime <= e.end);

    return (
        <div
            className="relative flex h-full w-full items-center justify-center [container-type:size]"
            onPointerDown={() => selectEffect(null)}
        >
            <div
                className="relative overflow-hidden rounded-lg"
                style={{
                    aspectRatio: canvasAspect,
                    width: `min(100cqw, ${100 * canvasAspect}cqh)`,
                    background: isPlain ? "black" : frameBackground(frame),
                    boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.5)",
                }}
            >
                <div
                    className="absolute inset-0 flex items-center justify-center [container-type:size]"
                    style={{ padding: `calc(${frame.padding / 100} * min(100cqw, 100cqh))` }}
                >
                    <div className="flex h-full w-full items-center justify-center [container-type:size]">
                        <div
                            ref={setVideoBox}
                            className="relative [container-type:size]"
                            style={{ aspectRatio: videoAspect, width: `min(100cqw, ${100 * videoAspect}cqh)` }}
                        >
                            <div
                                className="absolute inset-0 overflow-hidden"
                                style={{
                                    borderRadius: `calc(${frame.radius / 100} * min(100cqw, 100cqh))`,
                                    boxShadow: frame.shadow ? "0 6cqh 8cqh rgba(0,0,0,0.6)" : undefined,
                                }}
                            >
                                <video
                                    ref={videoRef}
                                    src={videoSrc!}
                                    className="absolute inset-0 h-full w-full"
                                    style={{ transform: zoomTransform(zoom), transformOrigin: "0 0" }}
                                    playsInline
                                    preload="metadata"
                                    onLoadedMetadata={(e) => {
                                        const v = e.currentTarget;
                                        if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
                                    }}
                                />

                                {effects.filter(isVisible).map((effect) => {
                                    const isSelected = effect.id === selectedEffectId;
                                    const ring = isSelected ? "outline outline-1 outline-primary" : "";
                                    if (effect.kind === "blur") {
                                        return (
                                            <div
                                                key={effect.id}
                                                className={`absolute cursor-move ${ring}`}
                                                style={{
                                                    left: `${effect.x * 100}%`,
                                                    top: `${effect.y * 100}%`,
                                                    width: `${effect.w * 100}%`,
                                                    height: `${effect.h * 100}%`,
                                                    backdropFilter: "blur(12px)",
                                                }}
                                                onPointerDown={(e) => {
                                                    selectEffect(effect.id);
                                                    startDrag(e, videoBox, (dx, dy) =>
                                                        updateEffect(effect.id, {
                                                            x: clamp01(Math.min(effect.x + dx, 1 - effect.w)),
                                                            y: clamp01(Math.min(effect.y + dy, 1 - effect.h)),
                                                        })
                                                    );
                                                }}
                                            >
                                                {isSelected && (
                                                    <div
                                                        aria-label="Resize blur"
                                                        className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-full bg-primary"
                                                        onPointerDown={(e) =>
                                                            startDrag(e, videoBox, (dx, dy) =>
                                                                updateEffect(effect.id, {
                                                                    w: Math.max(0.03, Math.min(effect.w + dx, 1 - effect.x)),
                                                                    h: Math.max(0.03, Math.min(effect.h + dy, 1 - effect.y)),
                                                                })
                                                            )
                                                        }
                                                    />
                                                )}
                                            </div>
                                        );
                                    }
                                    if (effect.kind === "text") {
                                        const fontSize = `${effect.size * 100}cqh`;
                                        return (
                                            <div
                                                key={effect.id}
                                                className={`absolute cursor-move whitespace-pre ${ring}`}
                                                style={{
                                                    left: `${effect.x * 100}%`,
                                                    top: `${effect.y * 100}%`,
                                                    color: effect.color,
                                                    font: `700 ${fontSize}/1.2 system-ui, sans-serif`,
                                                    textShadow: `0 calc(${fontSize} * 0.04) calc(${fontSize} * 0.15) rgba(0,0,0,0.6)`,
                                                }}
                                                onPointerDown={(e) => {
                                                    selectEffect(effect.id);
                                                    startDrag(e, videoBox, (dx, dy) =>
                                                        updateEffect(effect.id, {
                                                            x: clamp01(effect.x + dx),
                                                            y: clamp01(effect.y + dy),
                                                        })
                                                    );
                                                }}
                                            >
                                                {effect.text}
                                            </div>
                                        );
                                    }
                                    if (effect.kind === "zoom" && aimingZoom && isSelected) {
                                        const view = 1 / effect.scale;
                                        const left = Math.max(0, Math.min(1 - view, effect.cx - view / 2));
                                        const top = Math.max(0, Math.min(1 - view, effect.cy - view / 2));
                                        return (
                                            <div
                                                key={effect.id}
                                                aria-label="Zoom window"
                                                className="absolute cursor-move rounded-md border-2 border-primary bg-primary/10"
                                                style={{
                                                    left: `${left * 100}%`,
                                                    top: `${top * 100}%`,
                                                    width: `${view * 100}%`,
                                                    height: `${view * 100}%`,
                                                }}
                                                onPointerDown={(e) =>
                                                    startDrag(e, videoBox, (dx, dy) =>
                                                        updateEffect(effect.id, {
                                                            cx: clamp01(left + dx + view / 2),
                                                            cy: clamp01(top + dy + view / 2),
                                                        })
                                                    )
                                                }
                                            >
                                                <span className="absolute left-1 top-1 rounded-md bg-background/80 px-1 font-mono text-[11px] text-foreground">
                                                    {effect.scale}×
                                                </span>
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
