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
import { useVideo } from "./video-context";

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
function generateTicks(visibleDuration: number, zoom: number) {
    const interval = zoom <= 1 ? 5 : zoom <= 2 ? 2 : 1;
    const ticks: number[] = [];
    for (let t = 0; t <= visibleDuration; t += interval) {
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
    const {
        duration,
        currentTime,
        hasVideo,
        trimStart,
        trimEnd,
        seek,
        setTrimStart,
        setTrimEnd,
    } = useVideo();

    const [zoom, setZoom] = useState(1);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    const [isDraggingTrimStart, setIsDraggingTrimStart] = useState(false);
    const [isDraggingTrimEnd, setIsDraggingTrimEnd] = useState(false);
    const [containerWidth, setContainerWidth] = useState(0);
    const trackRef = useRef<HTMLDivElement>(null);

    // Track container width so the timeline always fills the available space
    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            setContainerWidth(entry.contentRect.width);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Use real duration or a sensible fallback (30s) for the empty state
    const effectiveDuration = duration > 0 ? duration : 30;
    // At zoom=1, the video clip fills the entire container width (48px padding for the track)
    const trackPadding = 48;
    const basePxPerSecond = containerWidth > trackPadding
        ? (containerWidth - trackPadding) / effectiveDuration
        : 40;
    const pxPerSecond = basePxPerSecond * zoom;
    const videoTrackWidth = effectiveDuration * pxPerSecond;
    // Content width: at least the container, or wider when zoomed in
    const contentWidth = Math.max(videoTrackWidth + trackPadding, containerWidth);
    // Extend ruler ticks to cover the full visible width
    const visibleDurationInSeconds = contentWidth / pxPerSecond;
    const ticks = generateTicks(visibleDurationInSeconds, zoom);

    const posToTime = useCallback(
        (clientX: number) => {
            if (!trackRef.current) return 0;
            const rect = trackRef.current.getBoundingClientRect();
            const x = clientX - rect.left + trackRef.current.scrollLeft;
            return Math.max(0, Math.min(effectiveDuration, x / pxPerSecond));
        },
        [pxPerSecond, effectiveDuration]
    );

    /* Dragging logic — uses global mouse events for smooth drag even outside the track */
    useEffect(() => {
        if (!isDraggingPlayhead && !isDraggingTrimStart && !isDraggingTrimEnd)
            return;

        function onMouseMove(e: MouseEvent) {
            const time = posToTime(e.clientX);
            if (isDraggingPlayhead) seek(time);
            if (isDraggingTrimStart) setTrimStart(time);
            if (isDraggingTrimEnd) setTrimEnd(time);
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
        seek,
        setTrimStart,
        setTrimEnd,
    ]);

    /** Auto-scroll to keep the playhead in view during playback */
    useEffect(() => {
        if (!trackRef.current || isDraggingPlayhead) return;
        const container = trackRef.current;
        const playheadX = currentTime * pxPerSecond + 24;
        const { scrollLeft, clientWidth } = container;

        // If playhead is outside the visible range, scroll to it
        if (playheadX < scrollLeft + 40 || playheadX > scrollLeft + clientWidth - 40) {
            container.scrollTo({ left: playheadX - clientWidth / 3, behavior: "smooth" });
        }
    }, [currentTime, pxPerSecond, isDraggingPlayhead]);

    function handleTrackClick(e: React.MouseEvent) {
        if (isDraggingTrimStart || isDraggingTrimEnd || !hasVideo) return;
        const time = posToTime(e.clientX);
        seek(time);
    }

    function handleZoomIn() {
        setZoom((z) => Math.min(4, z * 1.25));
    }

    function handleZoomOut() {
        setZoom((z) => Math.max(0.25, z / 1.25));
    }

    function handleToolbarAction(label: string) {
        switch (label) {
            case "Zoom in":
                handleZoomIn();
                break;
            case "Zoom out":
                handleZoomOut();
                break;
            case "Reset timeline":
                setZoom(1);
                setTrimStart(0);
                setTrimEnd(duration);
                break;
        }
    }

    return (
        <TooltipProvider delayDuration={200}>
            <div className={`flex h-[220px] shrink-0 flex-col border-t border-zinc-800 bg-zinc-950 transition-opacity duration-200 ${hasVideo ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
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
                                        onClick={() => handleToolbarAction(item.label)}
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
                        style={{ width: `${contentWidth}px` }}
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
                            {/* Track bar spans the full visible width */}
                            <div className="relative h-12 overflow-hidden rounded-md bg-zinc-800/60">
                                {/* Video clip block — only as wide as the video, sitting at the left */}
                                {hasVideo && (
                                    <div
                                        className="absolute inset-y-0 left-0 rounded-md bg-gradient-to-r from-emerald-700/30 via-emerald-600/20 to-emerald-700/30"
                                        style={{ width: `${videoTrackWidth}px` }}
                                    >
                                        {/* Waveform decoration */}
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
                                )}

                                {/* Trim selection overlay */}
                                {hasVideo && trimEnd > trimStart && (
                                    <div
                                        className="absolute inset-y-0 border-y-2 border-primary/60 bg-primary/10"
                                        style={{
                                            left: `${trimStart * pxPerSecond}px`,
                                            width: `${(trimEnd - trimStart) * pxPerSecond}px`,
                                        }}
                                    >
                                        {/* Start handle */}
                                        <div
                                            className="absolute -left-1.5 inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center rounded-l-sm bg-primary transition-colors hover:bg-primary/80"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setIsDraggingTrimStart(true);
                                            }}
                                        >
                                            <GripVertical className="h-3 w-3 text-primary-foreground" />
                                        </div>

                                        {/* End handle */}
                                        <div
                                            className="absolute -right-1.5 inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center rounded-r-sm bg-primary transition-colors hover:bg-primary/80"
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
                                )}
                            </div>

                            {/* Playhead */}
                            {hasVideo && (
                                <div
                                    className="absolute top-0 bottom-0 z-20 flex flex-col items-center"
                                    style={{ left: `${currentTime * pxPerSecond + 24}px` }}
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
                            )}
                        </div>

                        {/* Bottom action hints */}
                        <div className="absolute bottom-2 right-6 flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-6 gap-1.5 border-zinc-700 bg-zinc-900 text-[11px] text-zinc-400 hover:text-zinc-200"
                                onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
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
