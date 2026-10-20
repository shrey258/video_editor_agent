"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { Droplets, Focus, Type, type LucideIcon } from "lucide-react";
import { useVideo } from "./video-context";
import type { Effect, EffectKind } from "./video-store";

export const EFFECT_STYLES: Record<EffectKind, { label: string; icon: LucideIcon; bar: string; handle: string }> = {
    zoom: { label: "Zoom", icon: Focus, bar: "bg-sky-400/15 border-sky-400/40", handle: "bg-sky-400" },
    text: { label: "Text", icon: Type, bar: "bg-fuchsia-400/15 border-fuchsia-400/40", handle: "bg-fuchsia-400" },
    blur: { label: "Blur", icon: Droplets, bar: "bg-slate-300/15 border-slate-300/40", handle: "bg-slate-300" },
};

export const EFFECT_KINDS: EffectKind[] = ["zoom", "text", "blur"];

const MIN_EFFECT_SEC = 0.2;

/** One lane under the main track: zoom/text/blur bars you can drag and resize. */
export function EffectsTrack({ pxPerSecond }: { pxPerSecond: number }) {
    const { effects, selectedEffectId, duration, selectEffect, updateEffect } = useVideo();

    function drag(e: ReactPointerEvent, effect: Effect, mode: "move" | "start" | "end") {
        e.preventDefault();
        e.stopPropagation();
        selectEffect(effect.id);
        const x0 = e.clientX;
        const length = effect.end - effect.start;
        const move = (ev: PointerEvent) => {
            const dt = (ev.clientX - x0) / pxPerSecond;
            if (mode === "move") {
                const start = Math.max(0, Math.min(effect.start + dt, duration - length));
                updateEffect(effect.id, { start, end: start + length });
            } else if (mode === "start") {
                updateEffect(effect.id, { start: Math.max(0, Math.min(effect.start + dt, effect.end - MIN_EFFECT_SEC)) });
            } else {
                updateEffect(effect.id, { end: Math.min(duration, Math.max(effect.end + dt, effect.start + MIN_EFFECT_SEC)) });
            }
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    }

    return (
        <div className="relative mt-1.5 h-6 shrink-0 rounded-md bg-secondary/40">
            {effects.map((effect) => {
                const style = EFFECT_STYLES[effect.kind];
                const isSelected = effect.id === selectedEffectId;
                return (
                    <div
                        key={effect.id}
                        className={`group absolute inset-y-0 flex cursor-grab items-center overflow-hidden rounded-md border active:cursor-grabbing ${style.bar} ${isSelected ? "ring-1 ring-primary" : ""}`}
                        style={{ left: effect.start * pxPerSecond, width: (effect.end - effect.start) * pxPerSecond }}
                        onPointerDown={(e) => drag(e, effect, "move")}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="absolute inset-y-0 left-0 flex w-2 cursor-ew-resize items-center justify-center"
                            onPointerDown={(e) => drag(e, effect, "start")}
                        >
                            <div className={`h-3 w-0.5 rounded-full ${style.handle}`} />
                        </div>
                        <span className="truncate px-2.5 text-[11px] text-zinc-300">
                            {effect.kind === "text" ? effect.text : effect.kind === "zoom" ? `Zoom ${effect.scale}×` : style.label}
                        </span>
                        <div
                            className="absolute inset-y-0 right-0 flex w-2 cursor-ew-resize items-center justify-center"
                            onPointerDown={(e) => drag(e, effect, "end")}
                        >
                            <div className={`h-3 w-0.5 rounded-full ${style.handle}`} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
