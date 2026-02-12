"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
    Plus,
    ZoomIn,
    ZoomOut,
    Scissors,
    Trash2,
    Undo2,
    Redo2,
    RotateCcw,
    GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const TOOLBAR_ITEMS = [
    { icon: Plus, label: "Add segment", shortcut: "A" },
    { icon: ZoomIn, label: "Zoom in", shortcut: "+" },
    { icon: ZoomOut, label: "Zoom out", shortcut: "-" },
    { icon: Scissors, label: "Split", shortcut: "S" },
    { icon: Trash2, label: "Delete", shortcut: "⌫" },
    { icon: Undo2, label: "Undo", shortcut: "⌘Z" },
    { icon: Redo2, label: "Redo", shortcut: "⇧⌘Z" },
    { icon: RotateCcw, label: "Reset timeline", shortcut: "" },
] as const;

/** Generate ruler tick marks */
function generateTicks(duration: number, zoom: number) {
    const interval = zoom <= 1 ? 5 : zoom <= 2 ? 2 : 1;
    const ticks: number[] = [];
    for (let t = 0; t <= duration; t += interval) {
        ticks.push(t);
    }
    return ticks;
}

function formatRulerTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Timeline() {
    const [zoom, setZoom] = useState(1);
    const [playheadPos, setPlayheadPos] = useState(0);
    const [trimStart, setTrimStart] = useState(18); // seconds
    const [trimEnd, setTrimEnd] = useState(25); // seconds
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    const [isDraggingTrimStart, setIsDraggingTrimStart] = useState(false);
    const [isDraggingTrimEnd, setIsDraggingTrimEnd] = useState(false);
    const trackRef = useRef<HTMLDivElement>(null);

    const duration = 27.43; // mock
    const pxPerSecond = 40 * zoom;
    const trackWidth = duration * pxPerSecond;
    const ticks = generateTicks(duration, zoom);

    const posToTime = useCallback(
        (clientX: number) => {
            if (!trackRef.current) return 0;
            const rect = trackRef.current.getBoundingClientRect();
            const x = clientX - rect.left + trackRef.current.scrollLeft;
            return Math.max(0, Math.min(duration, x / pxPerSecond));
        },
        [pxPerSecond, duration]
    );

    /* Dragging logic */
    useEffect(() => {
        if (!isDraggingPlayhead && !isDraggingTrimStart && !isDraggingTrimEnd)
            return;

        function onMouseMove(e: MouseEvent) {
            const time = posToTime(e.clientX);
            if (isDraggingPlayhead) setPlayheadPos(time);
            if (isDraggingTrimStart) setTrimStart(Math.min(time, trimEnd - 0.5));
            if (isDraggingTrimEnd) setTrimEnd(Math.max(time, trimStart + 0.5));
        }

        function onMouseUp() {
            setIsDraggingPlayhead(false);
            setIsDraggingTrimStart(false);
            setIsDraggingTrimEnd(false);
        }

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [
        isDraggingPlayhead,
        isDraggingTrimStart,
        isDraggingTrimEnd,
        posToTime,
        trimStart,
        trimEnd,
    ]);

    function handleTrackClick(e: React.MouseEvent) {
        if (isDraggingTrimStart || isDraggingTrimEnd) return;
        setPlayheadPos(posToTime(e.clientX));
    }

    return (
        <TooltipProvider delayDuration={200}>
            <div className="flex h-[220px] shrink-0 flex-col border-t border-zinc-800 bg-zinc-950">
                {/* Toolbar */}
                <div className="flex items-center gap-1 border-b border-zinc-800/60 px-3 py-1.5">
                    {TOOLBAR_ITEMS.map((item, i) => (
                        <span key={item.label} className="contents">
                            {i === 5 && (
                                <Separator orientation="vertical" className="mx-1 h-5 bg-zinc-800" />
                            )}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
                                    >
                                        <item.icon className="h-3.5 w-3.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="bg-zinc-800 text-zinc-200">
                                    <span>{item.label}</span>
                                    {item.shortcut && (
                                        <span className="ml-2 text-zinc-500">{item.shortcut}</span>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        </span>
                    ))}

                    {/* Zoom indicator */}
                    <div className="ml-auto font-mono text-[11px] text-zinc-500">
                        {Math.round(zoom * 100)}%
                    </div>
                </div>

                {/* Timeline track area */}
                <div
                    ref={trackRef}
                    className="scrollbar-thin relative flex-1 overflow-x-auto overflow-y-hidden"
                    onClick={handleTrackClick}
                >
                    <div
                        className="relative min-h-full"
                        style={{ width: `${trackWidth + 48}px` }}
                    >
                        {/* Ruler */}
                        <div className="relative h-6 border-b border-zinc-800/60">
                            {ticks.map((t) => (
                                <div
                                    key={t}
                                    className="absolute top-0 flex h-full flex-col items-center"
                                    style={{ left: `${t * pxPerSecond + 24}px` }}
                                >
                                    <div className="h-2.5 w-px bg-zinc-700" />
                                    <span className="mt-0.5 text-[9px] tabular-nums text-zinc-500 select-none">
                                        {formatRulerTime(t)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Track */}
                        <div className="relative px-6 py-3">
                            {/* Track bar */}
                            <div className="relative h-12 overflow-hidden rounded-md bg-zinc-800/60">
                                {/* Full clip visual */}
                                <div
                                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-700/30 via-emerald-600/20 to-emerald-700/30"
                                    style={{ width: `${trackWidth}px` }}
                                >
                                    {/* Waveform-like decoration (deterministic to avoid SSR hydration mismatch) */}
                                    <div className="flex h-full items-center gap-px px-2">
                                        {Array.from({ length: Math.floor(duration * 3) }).map((_, i) => {
                                            const pseudo = ((i * 2654435761) >>> 0) / 4294967296;
                                            return (
                                                <div
                                                    key={i}
                                                    className="w-[2px] shrink-0 rounded-full bg-emerald-500/40"
                                                    style={{
                                                        height: `${20 + Math.sin(i * 0.7) * 15 + pseudo * 10}%`,
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Trim selection overlay */}
                                <div
                                    className="absolute inset-y-0 border-y-2 border-primary/60 bg-primary/10"
                                    style={{
                                        left: `${trimStart * pxPerSecond}px`,
                                        width: `${(trimEnd - trimStart) * pxPerSecond}px`,
                                    }}
                                >
                                    {/* Start handle */}
                                    <div
                                        className="absolute -left-1.5 inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center rounded-l-sm bg-primary hover:bg-primary/80 transition-colors"
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setIsDraggingTrimStart(true);
                                        }}
                                    >
                                        <GripVertical className="h-3 w-3 text-primary-foreground" />
                                    </div>

                                    {/* End handle */}
                                    <div
                                        className="absolute -right-1.5 inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center rounded-r-sm bg-primary hover:bg-primary/80 transition-colors"
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setIsDraggingTrimEnd(true);
                                        }}
                                    >
                                        <GripVertical className="h-3 w-3 text-primary-foreground" />
                                    </div>

                                    {/* Trim label */}
                                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-primary/90 px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">
                                        {formatRulerTime(trimStart)} → {formatRulerTime(trimEnd)}
                                    </div>
                                </div>
                            </div>

                            {/* Playhead */}
                            <div
                                className="absolute top-0 bottom-0 z-20 flex flex-col items-center"
                                style={{ left: `${playheadPos * pxPerSecond + 24}px` }}
                            >
                                {/* Head triangle */}
                                <div
                                    className="h-2.5 w-3 cursor-grab active:cursor-grabbing"
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        setIsDraggingPlayhead(true);
                                    }}
                                    style={{
                                        clipPath: "polygon(0 0, 100% 0, 50% 100%)",
                                        background: "hsl(var(--primary))",
                                    }}
                                />
                                {/* Line */}
                                <div className="w-px flex-1 bg-primary" />
                            </div>
                        </div>

                        {/* Bottom action hints */}
                        <div className="absolute bottom-2 right-6 flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-6 gap-1.5 border-zinc-700 bg-zinc-900 text-[11px] text-zinc-400 hover:text-zinc-200"
                                onClick={() => setZoom((z) => Math.min(4, z * 1.25))}
                            >
                                <ZoomIn className="h-3 w-3" />
                                Zoom
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-6 gap-1.5 border-zinc-700 bg-zinc-900 text-[11px] text-zinc-400 hover:text-zinc-200"
                            >
                                <Scissors className="h-3 w-3" />
                                Trim
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}
