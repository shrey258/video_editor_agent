"use client";

import { useState, useCallback, useRef, useEffect, type DragEvent, type ChangeEvent } from "react";
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize2,
    Minimize2,
    Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

export function Stage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState([80]);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);

    // ── File handling ──────────────────────────────────────────────

    const loadFile = useCallback((file: File) => {
        if (!ACCEPTED_TYPES.includes(file.type)) return;

        // Revoke previous object URL to avoid memory leak
        setVideoSrc((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
        });
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
    }, []);

    const handleDrop = useCallback(
        (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) loadFile(file);
        },
        [loadFile]
    );

    const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleFileSelect = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) loadFile(file);
            // Reset so the same file can be re-selected
            e.target.value = "";
        },
        [loadFile]
    );

    // ── Video element event listeners ──────────────────────────────

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onTimeUpdate = () => {
            if (!isSeeking) setCurrentTime(video.currentTime);
        };
        const onLoadedMetadata = () => {
            setDuration(video.duration);
        };
        const onEnded = () => {
            setIsPlaying(false);
        };

        video.addEventListener("timeupdate", onTimeUpdate);
        video.addEventListener("loadedmetadata", onLoadedMetadata);
        video.addEventListener("ended", onEnded);
        return () => {
            video.removeEventListener("timeupdate", onTimeUpdate);
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("ended", onEnded);
        };
    }, [videoSrc, isSeeking]);

    // ── Sync volume to video element ───────────────────────────────

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.volume = isMuted ? 0 : volume[0] / 100;
        video.muted = isMuted;
    }, [volume, isMuted]);

    // ── Controls ───────────────────────────────────────────────────

    const handlePlayPause = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play();
            setIsPlaying(true);
        } else {
            video.pause();
            setIsPlaying(false);
        }
    }, []);

    const handleSeek = useCallback((value: number[]) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = value[0];
        setCurrentTime(value[0]);
    }, []);

    const handleSeekStart = useCallback(() => {
        setIsSeeking(true);
    }, []);

    const handleSeekEnd = useCallback((value: number[]) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = value[0];
        setCurrentTime(value[0]);
        setIsSeeking(false);
    }, []);

    const handleToggleMute = useCallback(() => {
        setIsMuted((prev) => !prev);
    }, []);

    const handleVolumeChange = useCallback((v: number[]) => {
        setVolume(v);
        if (v[0] > 0) setIsMuted(false);
    }, []);

    const handleFullscreen = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            video.requestFullscreen();
        }
    }, []);

    // ── Cleanup object URL on unmount ──────────────────────────────

    useEffect(() => {
        return () => {
            if (videoSrc) URL.revokeObjectURL(videoSrc);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Render ─────────────────────────────────────────────────────

    const hasVideo = videoSrc !== null;

    return (
        <div
            className="relative flex flex-1 flex-col overflow-hidden bg-zinc-950/50"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
        >
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={handleFileSelect}
            />

            {/* Video Preview Area */}
            <div className="relative flex w-full flex-1 items-center justify-center p-4">
                {hasVideo ? (
                    /* Video fills the available area, object-contain preserves ratio */
                    <div className="relative h-full w-full overflow-hidden bg-black">
                        <video
                            ref={videoRef}
                            src={videoSrc}
                            className="absolute inset-0 h-full w-full object-contain"
                            playsInline
                            preload="metadata"
                        />
                    </div>
                ) : (
                    /* Upload prompt */
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className={`group relative flex h-full w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed bg-zinc-900/50 transition-colors duration-200 ${isDragOver ? "border-primary bg-primary/5" : "border-zinc-700 hover:border-primary/50 hover:bg-zinc-900"}`}
                    >
                        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-colors duration-200 ${isDragOver ? "bg-primary/20" : "bg-zinc-800 group-hover:bg-primary/20"}`}>
                            <Upload className={`h-7 w-7 transition-colors duration-200 ${isDragOver ? "text-primary" : "text-zinc-400 group-hover:text-primary"}`} />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium text-zinc-300">
                                {isDragOver ? "Drop to upload" : "Drop your video here"}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                                or click to browse files
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                                MP4
                            </span>
                            <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                                MOV
                            </span>
                            <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                                WEBM
                            </span>
                        </div>
                    </button>
                )}
            </div>

            {/* Transport Controls */}
            <div className={`flex w-full shrink-0 flex-col gap-1.5 px-4 py-2 transition-opacity duration-200 ${hasVideo ? "opacity-100" : "pointer-events-none opacity-30"}`}>
                {/* Seek bar */}
                <Slider
                    value={[currentTime]}
                    max={duration || 1}
                    step={0.01}
                    onValueChange={handleSeek}
                    onPointerDown={handleSeekStart}
                    onPointerUp={() => handleSeekEnd([currentTime])}
                    className="w-full cursor-pointer"
                />

                {/* Controls row */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handlePlayPause}
                            className="h-7 w-7 text-zinc-300 hover:text-white"
                        >
                            {isPlaying ? (
                                <Pause className="h-4 w-4" />
                            ) : (
                                <Play className="h-4 w-4" />
                            )}
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleToggleMute}
                            className="h-7 w-7 text-zinc-300 hover:text-white"
                        >
                            {isMuted || volume[0] === 0 ? (
                                <VolumeX className="h-4 w-4" />
                            ) : (
                                <Volume2 className="h-4 w-4" />
                            )}
                        </Button>

                        <Slider
                            value={isMuted ? [0] : volume}
                            max={100}
                            step={1}
                            onValueChange={handleVolumeChange}
                            className="w-20"
                        />
                    </div>

                    {/* Timecode */}
                    <div className="font-mono text-xs tabular-nums text-zinc-400">
                        <span className="text-zinc-200">{formatTime(currentTime)}</span>
                        <span className="mx-1 text-zinc-600">/</span>
                        <span>{formatTime(duration)}</span>
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleFullscreen}
                        className="h-7 w-7 text-zinc-400 hover:text-white"
                    >
                        <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
