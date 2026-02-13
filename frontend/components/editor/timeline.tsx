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

/** Generate ruler tick marks with major and minor intervals */
function generateTicks(visibleDuration: number, zoom: number) {
    let majorInterval = 1;
    let minorSubdivisions = 0;

    if (zoom <= 0.25) {
        majorInterval = 10;
        minorSubdivisions = 0;
    } else if (zoom <= 0.5) {
        majorInterval = 5;
        minorSubdivisions = 0;
    } else if (zoom <= 1) {
        majorInterval = 2;
        minorSubdivisions = 4; // every 0.5s
    } else if (zoom <= 2) {
        majorInterval = 1;
        minorSubdivisions = 4; // every 0.25s
    } else {
        majorInterval = 1;
        minorSubdivisions = 9; // every 0.1s
    }

    const majorTicks: number[] = [];
    const minorTicks: number[] = [];

    for (let t = 0; t <= visibleDuration; t += majorInterval) {
        majorTicks.push(t);
        if (minorSubdivisions > 0 && t + majorInterval <= visibleDuration) {
            const step = majorInterval / (minorSubdivisions + 1);
            for (let i = 1; i <= minorSubdivisions; i++) {
                minorTicks.push(t + i * step);
            }
        }
    }

    return { majorTicks, minorTicks };
}

function formatRulerTime(seconds: number, zoom: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    // If zoomed in significantly, show one decimal place for "smart" precision
    if (zoom > 1.5) {
        const ms = Math.floor((seconds % 1) * 10);
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
    }
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
            // Important: subtract rect.left + 24 to account for both viewport offset and track padding
            const x = clientX - rect.left + trackRef.current.scrollLeft - 24;
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
                        className="relative min-h-full flex flex-col"
                        style={{ width: `${contentWidth}px` }}
                    >
                        {/* Track */}
                        <div className="relative px-6 py-3 flex-1 flex flex-col">
                            {/* Track bar */}
                            <div className="relative flex-1 rounded-md bg-zinc-800/60 mt-2 select-none">
                                {/* Video clip block */}
                                {hasVideo && (
                                    <div
                                        className="absolute inset-y-0 left-0 overflow-hidden rounded-md border-y border-x-4 border-emerald-500 bg-gradient-to-r from-emerald-700/30 via-emerald-600/20 to-emerald-700/30"
                                        style={{ width: `${videoTrackWidth + 8}px` }}
                                    >
                                        {/* Top line for ticks */}
                                        <div className="absolute top-0 left-0 right-0 h-px bg-[#D1D1D1]/20" />

                                        {/* Minor Ticks */}
                                        {ticks.minorTicks.map((t) => (
                                            <div
                                                key={`minor-${t}`}
                                                className="absolute top-0 w-px bg-[#D1D1D1]"
                                                style={{
                                                    left: `${t * pxPerSecond}px`,
                                                    height: "8px",
                                                }}
                                            />
                                        ))}

                                        {/* Major Ticks & Labels */}
                                        {ticks.majorTicks.map((t) => (
                                            <div
                                                key={`major-${t}`}
                                                className="absolute top-0 flex flex-col items-center"
                                                style={{ left: `${t * pxPerSecond}px` }}
                                            >
                                                {/* Major Tick */}
                                                <div
                                                    className="w-px bg-[#D1D1D1]"
                                                    style={{ height: "15px" }}
                                                />
                                                {/* Label */}
                                                <span
                                                    className="absolute top-4 -translate-x-1/2 whitespace-nowrap font-sans text-[10pt] font-medium text-[#666666]"
                                                    style={{ color: "#666666" }}
                                                >
                                                    {formatRulerTime(t, zoom)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Playhead - Centered and visible */}
                                {hasVideo && (
                                    <div
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setIsDraggingPlayhead(true);
                                        }}
                                        className="absolute bottom-0 top-[-10px] z-20 flex flex-col items-center cursor-grab active:cursor-grabbing -translate-x-1/2 pointer-events-auto"
                                        style={{ left: `${currentTime * pxPerSecond + 4}px` }}
                                    >
                                        {/* Head triangle */}
                                        <div
                                            className="h-3 w-3 relative z-30"
                                            style={{
                                                clipPath: "polygon(0 0, 100% 0, 50% 100%)",
                                                background: "hsl(var(--primary))",
                                                filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.3))"
                                            }}
                                        />
                                        {/* Line */}
                                        <div className="w-[1.5px] flex-1 bg-primary shadow-[0_0_4px_rgba(0,0,0,0.3)]" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}
