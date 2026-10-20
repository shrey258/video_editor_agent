"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { EFFECT_KINDS, EFFECT_STYLES } from "./effects-track";
import { frameBackground } from "./preview-canvas";
import { useVideo } from "./video-context";
import { ZOOM_SCALES, type FrameAspect } from "./video-store";

// These are colors baked into the exported video, not UI chrome, so they are raw values on purpose.
const BACKGROUNDS = [
    ["#000000"],
    ["#18181b"],
    ["#ffffff"],
    ["#0acffe", "#495aff"],
    ["#48c6ef", "#6f86d6"],
    ["#43e97b", "#38f9d7"],
    ["#f093fb", "#f5576c"],
    ["#ff7a18", "#7a00ff"],
];
const TEXT_COLORS = ["#ffffff", "#000000", "#facc15", "#22c55e", "#ef4444", "#3b82f6"];
const ASPECT_OPTIONS: FrameAspect[] = ["native", "16:9", "9:16", "1:1", "4:3", "4:5"];

function Label({ children }: { children: React.ReactNode }) {
    return <p className="mb-1.5 text-[11px] text-muted-foreground">{children}</p>;
}

function Swatch({ background, active, label, onClick }: { background: string; active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            aria-label={label}
            onClick={onClick}
            className={`h-6 w-6 rounded-full border transition-colors duration-200 ${active ? "border-primary ring-1 ring-primary" : "border-border"}`}
            style={{ background }}
        />
    );
}

/** Frame styling (background, padding, corners, aspect) and the selected zoom/text/blur's settings. */
export function EffectsPanel() {
    const { hasVideo, effects, selectedEffectId, frame, addEffect, updateEffect, removeEffect, setFrame } = useVideo();
    const selected = effects.find((e) => e.id === selectedEffectId);

    if (!hasVideo) {
        return (
            <div className="flex h-full w-[240px] shrink-0 items-center justify-center border-l border-border p-4">
                <p className="text-center text-xs text-muted-foreground">Upload a video to add zooms, text and a frame.</p>
            </div>
        );
    }

    return (
        <div className="scrollbar-thin flex h-full w-[240px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-border p-4">
            <section>
                <Label>Add at playhead</Label>
                <div className="grid grid-cols-3 gap-1.5">
                    {EFFECT_KINDS.map((kind) => {
                        const { icon: Icon, label } = EFFECT_STYLES[kind];
                        return (
                            <Button key={kind} variant="secondary" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => addEffect(kind)}>
                                <Icon className="h-3.5 w-3.5" />
                                {label}
                            </Button>
                        );
                    })}
                </div>
            </section>

            {selected && (
                <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-foreground">{EFFECT_STYLES[selected.kind].label}</p>
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {selected.start.toFixed(1)}s – {selected.end.toFixed(1)}s
                        </span>
                    </div>

                    {selected.kind === "zoom" && (
                        <div>
                            <Label>Depth</Label>
                            <div className="grid grid-cols-3 gap-1">
                                {ZOOM_SCALES.map((scale) => (
                                    <Button
                                        key={scale}
                                        variant="secondary"
                                        size="sm"
                                        className={`${selected.scale === scale ? "bg-primary/15 text-primary hover:bg-primary/20" : ""} h-7 px-1 font-mono text-[11px]`}
                                        onClick={() => updateEffect(selected.id, { scale })}
                                    >
                                        {scale}×
                                    </Button>
                                ))}
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground">Pause and drag the box on the preview to aim.</p>
                        </div>
                    )}

                    {selected.kind === "text" && (
                        <>
                            <Input
                                value={selected.text}
                                onChange={(e) => updateEffect(selected.id, { text: e.target.value })}
                                className="h-8 text-xs"
                                aria-label="Text"
                            />
                            <div>
                                <Label>Size</Label>
                                <Slider
                                    value={[selected.size * 100]}
                                    min={3}
                                    max={25}
                                    step={0.5}
                                    onValueChange={(v) => updateEffect(selected.id, { size: v[0] / 100 })}
                                />
                            </div>
                            <div>
                                <Label>Color</Label>
                                <div className="flex gap-1.5">
                                    {TEXT_COLORS.map((color) => (
                                        <Swatch
                                            key={color}
                                            label={`Text color ${color}`}
                                            background={color}
                                            active={selected.color === color}
                                            onClick={() => updateEffect(selected.id, { color })}
                                        />
                                    ))}
                                </div>
                            </div>
                            <p className="text-[11px] text-muted-foreground">Drag the text on the preview to place it.</p>
                        </>
                    )}

                    {selected.kind === "blur" && (
                        <p className="text-[11px] text-muted-foreground">Drag the box on the preview to move it, and its corner to resize.</p>
                    )}

                    <Button variant="destructive" size="sm" className="h-7 gap-1 text-xs" onClick={() => removeEffect(selected.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                    </Button>
                </section>
            )}

            <section className="flex flex-col gap-4">
                <p className="text-xs font-medium text-foreground">Frame</p>
                <div>
                    <Label>Aspect ratio</Label>
                    <div className="grid grid-cols-3 gap-1">
                        {ASPECT_OPTIONS.map((aspect) => (
                            <Button
                                key={aspect}
                                variant="secondary"
                                size="sm"
                                className={`${frame.aspect === aspect ? "bg-primary/15 text-primary hover:bg-primary/20" : ""} h-7 px-1 text-[11px]`}
                                onClick={() => setFrame({ aspect })}
                            >
                                {aspect === "native" ? "Original" : aspect}
                            </Button>
                        ))}
                    </div>
                </div>
                <div>
                    <Label>Background</Label>
                    <div className="flex flex-wrap gap-1.5">
                        {BACKGROUNDS.map((colors) => (
                            <Swatch
                                key={colors.join()}
                                label={`Background ${colors.join(" to ")}`}
                                background={frameBackground({ ...frame, colors })}
                                active={frame.colors.join() === colors.join()}
                                onClick={() => setFrame({ colors })}
                            />
                        ))}
                    </div>
                </div>
                <div>
                    <Label>Padding {frame.padding}%</Label>
                    <Slider value={[frame.padding]} max={30} step={1} onValueChange={(v) => setFrame({ padding: v[0] })} />
                </div>
                <div>
                    <Label>Corner radius {frame.radius}%</Label>
                    <Slider value={[frame.radius]} max={25} step={1} onValueChange={(v) => setFrame({ radius: v[0] })} />
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    className={`${frame.shadow ? "bg-primary/15 text-primary hover:bg-primary/20" : ""} h-7 text-xs`}
                    onClick={() => setFrame({ shadow: !frame.shadow })}
                >
                    Shadow {frame.shadow ? "on" : "off"}
                </Button>
            </section>
        </div>
    );
}
