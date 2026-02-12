"use client";

import { useState, useCallback } from "react";
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize2,
    Upload,
    Film,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

export function Stage() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState([80]);
    const [currentTime, setCurrentTime] = useState(0);
    const [hasVideo, setHasVideo] = useState(false);

    // Mock values
    const duration = 27.43;

    const handlePlayPause = useCallback(() => {
        setIsPlaying((prev) => !prev);
    }, []);

    const handleSeek = useCallback((value: number[]) => {
        setCurrentTime(value[0]);
    }, []);

    return (
        <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-zinc-950/50 p-4">
            {/* Video Preview Area */}
            <div className="relative flex w-full max-w-4xl flex-1 items-center justify-center">
                {hasVideo ? (
                    /* 16:9 video container */
                    <div className="relative aspect-video w-full max-h-full overflow-hidden rounded-lg bg-black shadow-2xl shadow-black/50">
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Film className="h-16 w-16 text-zinc-700" />
                        </div>
                    </div>
                ) : (
                    /* Upload prompt */
                    <button
                        onClick={() => setHasVideo(true)}
                        className="group relative flex aspect-video w-full max-h-full cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 transition-colors duration-200 hover:border-primary/50 hover:bg-zinc-900"
                    >
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 transition-colors duration-200 group-hover:bg-primary/20">
                            <Upload className="h-7 w-7 text-zinc-400 transition-colors duration-200 group-hover:text-primary" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium text-zinc-300">
                                Drop your video here
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
            <div className="mt-3 flex w-full max-w-[480px] flex-col gap-1.5">
                {/* Seek bar */}
                <Slider
                    value={[currentTime]}
                    max={duration}
                    step={0.01}
                    onValueChange={handleSeek}
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
                            onClick={() => setIsMuted(!isMuted)}
                            className="h-7 w-7 text-zinc-300 hover:text-white"
                        >
                            {isMuted ? (
                                <VolumeX className="h-4 w-4" />
                            ) : (
                                <Volume2 className="h-4 w-4" />
                            )}
                        </Button>

                        <Slider
                            value={isMuted ? [0] : volume}
                            max={100}
                            step={1}
                            onValueChange={(v) => {
                                setVolume(v);
                                if (v[0] > 0) setIsMuted(false);
                            }}
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
                        className="h-7 w-7 text-zinc-400 hover:text-white"
                    >
                        <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
