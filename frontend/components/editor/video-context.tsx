"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";

// ── Types ──────────────────────────────────────────────────────────

interface VideoState {
    /** Object URL of the loaded video, or null */
    videoSrc: string | null;
    /** Ref to the underlying <video> element */
    videoRef: React.RefObject<HTMLVideoElement | null>;
    /** Duration of the loaded video in seconds (0 until metadata loads) */
    duration: number;
    /** Current playback position in seconds */
    currentTime: number;
    isPlaying: boolean;
    isMuted: boolean;
    /** 0–100 */
    volume: number;
    /** Trim-in point in seconds */
    trimStart: number;
    /** Trim-out point in seconds */
    trimEnd: number;
    /** Multiple removed segments */
    trimRanges: Array<{ start: number; end: number }>;
    /** Whether a video file has been loaded */
    hasVideo: boolean;
}

interface VideoActions {
    loadFile: (file: File) => void;
    play: () => void;
    pause: () => void;
    togglePlayPause: () => void;
    seek: (time: number) => void;
    setVolume: (v: number) => void;
    toggleMute: () => void;
    setTrimStart: (t: number) => void;
    setTrimEnd: (t: number) => void;
    setTrimRange: (start: number, end: number) => void;
    setTrimRanges: (ranges: Array<{ start: number; end: number }>) => void;
    requestFullscreen: () => void;
}

type VideoContextValue = VideoState & VideoActions;

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const SKIP_EPSILON_SEC = 0.05;
const EXIT_EPSILON_SEC = 0.02;
const MIN_TRIM_DURATION_SEC = 0.05;

type TrimRange = { start: number; end: number };

function normalizeTrimRanges(
    ranges: TrimRange[],
    clamp: (time: number) => number
): TrimRange[] {
    const normalized = ranges
        .map((r) => ({
            start: clamp(Math.min(r.start, r.end)),
            end: clamp(Math.max(r.start, r.end)),
        }))
        .filter((r) => r.end - r.start > MIN_TRIM_DURATION_SEC)
        .sort((a, b) => a.start - b.start);

    if (normalized.length <= 1) return normalized;

    const merged: TrimRange[] = [normalized[0]];
    for (let i = 1; i < normalized.length; i += 1) {
        const current = normalized[i];
        const last = merged[merged.length - 1];
        if (current.start <= last.end + MIN_TRIM_DURATION_SEC) {
            last.end = Math.max(last.end, current.end);
        } else {
            merged.push(current);
        }
    }
    return merged;
}

// ── Context ────────────────────────────────────────────────────────

const VideoContext = createContext<VideoContextValue | null>(null);

export function useVideo(): VideoContextValue {
    const ctx = useContext(VideoContext);
    if (!ctx) throw new Error("useVideo must be used within <VideoProvider>");
    return ctx;
}

// ── Provider ───────────────────────────────────────────────────────

export function VideoProvider({ children }: { children: ReactNode }) {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolumeState] = useState(80);
    const [trimStart, setTrimStartState] = useState(0);
    const [trimEnd, setTrimEndState] = useState(0);
    const [trimRanges, setTrimRangesState] = useState<TrimRange[]>([]);

    const hasVideo = videoSrc !== null;
    const hasTrimmedGap = trimRanges.length > 0;

    const clampToDuration = useCallback(
        (time: number) => {
            if (duration <= 0) return Math.max(0, time);
            return Math.max(0, Math.min(time, duration));
        },
        [duration]
    );

    const snapAwayFromTrimmedGap = useCallback(
        (time: number) => {
            if (!hasTrimmedGap) return clampToDuration(time);
            const clamped = clampToDuration(time);
            const containing = trimRanges.find(
                (range) => clamped > range.start && clamped < range.end
            );
            if (!containing) return clamped;
            const midpoint = (containing.start + containing.end) / 2;
            return clamped < midpoint
                ? containing.start
                : clampToDuration(containing.end + EXIT_EPSILON_SEC);
        },
        [clampToDuration, hasTrimmedGap, trimRanges]
    );

    // ── File loading ───────────────────────────────────────────────

    const loadFile = useCallback((file: File) => {
        if (!ACCEPTED_TYPES.includes(file.type)) return;

        setVideoSrc((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
        });
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setTrimStartState(0);
        setTrimEndState(0);
        setTrimRangesState([]);
    }, []);

    // ── Sync <video> element ───────────────────────────────────────

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const enforceTrimSkip = () => {
            let nextTime = video.currentTime;
            if (hasTrimmedGap) {
                const rangeToSkip = trimRanges.find(
                    (range) =>
                        nextTime >= range.start - SKIP_EPSILON_SEC &&
                        nextTime < range.end - EXIT_EPSILON_SEC
                );
                if (rangeToSkip) {
                    const target = clampToDuration(rangeToSkip.end + EXIT_EPSILON_SEC);
                    video.currentTime = target;
                    nextTime = target;
                }
            }
            return nextTime;
        };

        const toDisplayTime = (time: number) => {
            if (hasTrimmedGap) {
                const nearRangeEnd = trimRanges.find(
                    (range) => time > range.end && time <= range.end + EXIT_EPSILON_SEC
                );
                if (nearRangeEnd) return nearRangeEnd.end;
            }
            return time;
        };

        const onTimeUpdate = () => {
            const nextTime = enforceTrimSkip();
            setCurrentTime(toDisplayTime(nextTime));
        };

        let rafId: number;
        const updateFrame = () => {
            if (isPlaying && video) {
                const nextTime = enforceTrimSkip();
                setCurrentTime(toDisplayTime(nextTime));
                rafId = requestAnimationFrame(updateFrame);
            }
        };

        if (isPlaying) {
            rafId = requestAnimationFrame(updateFrame);
        }

        const onLoadedMetadata = () => {
            setDuration(video.duration);
            // Default: no cut region selected yet.
            setTrimStartState(0);
            setTrimEndState(0);
            setTrimRangesState([]);
        };
        const onEnded = () => setIsPlaying(false);
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);

        video.addEventListener("timeupdate", onTimeUpdate);
        video.addEventListener("loadedmetadata", onLoadedMetadata);
        video.addEventListener("ended", onEnded);
        video.addEventListener("play", onPlay);
        video.addEventListener("pause", onPause);

        return () => {
            video.removeEventListener("timeupdate", onTimeUpdate);
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("ended", onEnded);
            video.removeEventListener("play", onPlay);
            video.removeEventListener("pause", onPause);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [videoSrc, isPlaying, hasTrimmedGap, trimRanges, duration, clampToDuration]);

    // ── Sync volume ────────────────────────────────────────────────

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.volume = isMuted ? 0 : volume / 100;
        video.muted = isMuted;
    }, [volume, isMuted]);

    // ── Cleanup on unmount ─────────────────────────────────────────

    useEffect(() => {
        return () => {
            if (videoSrc) URL.revokeObjectURL(videoSrc);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Actions ────────────────────────────────────────────────────

    const play = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (hasTrimmedGap) {
            const range = trimRanges.find(
                (r) => video.currentTime > r.start && video.currentTime < r.end
            );
            if (range) {
                const next = clampToDuration(range.end + EXIT_EPSILON_SEC);
                video.currentTime = next;
                setCurrentTime(range.end);
            }
        }
        void video.play();
    }, [hasTrimmedGap, trimRanges, clampToDuration]);

    const pause = useCallback(() => {
        videoRef.current?.pause();
    }, []);

    const togglePlayPause = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            if (hasTrimmedGap) {
                const range = trimRanges.find(
                    (r) => video.currentTime > r.start && video.currentTime < r.end
                );
                if (range) {
                    const next = clampToDuration(range.end + EXIT_EPSILON_SEC);
                    video.currentTime = next;
                    setCurrentTime(range.end);
                }
            }
            void video.play();
        } else {
            video.pause();
        }
    }, [hasTrimmedGap, trimRanges, clampToDuration]);

    const seek = useCallback((time: number) => {
        const video = videoRef.current;
        if (!video) return;
        const nextTime = snapAwayFromTrimmedGap(time);
        video.currentTime = nextTime;
        setCurrentTime(nextTime);
    }, [snapAwayFromTrimmedGap]);

    const setVolume = useCallback((v: number) => {
        setVolumeState(v);
        if (v > 0) setIsMuted(false);
    }, []);

    const toggleMute = useCallback(() => {
        setIsMuted((prev) => !prev);
    }, []);

    const setTrimRange = useCallback(
        (start: number, end: number) => {
            const normalized = normalizeTrimRanges([{ start, end }], clampToDuration);
            if (normalized.length === 0) {
                setTrimStartState(0);
                setTrimEndState(0);
                setTrimRangesState([]);
                return;
            }
            setTrimStartState(normalized[0].start);
            setTrimEndState(normalized[0].end);
            setTrimRangesState(normalized);
        },
        [clampToDuration]
    );

    const setTrimRanges = useCallback(
        (ranges: TrimRange[]) => {
            const normalized = normalizeTrimRanges(ranges, clampToDuration);
            setTrimRangesState(normalized);
            if (normalized.length === 0) {
                setTrimStartState(0);
                setTrimEndState(0);
            } else {
                setTrimStartState(normalized[0].start);
                setTrimEndState(normalized[0].end);
            }
        },
        [clampToDuration]
    );

    const setTrimStart = useCallback(
        (t: number) => {
            setTrimRange(t, trimEnd);
        },
        [setTrimRange, trimEnd]
    );

    const setTrimEnd = useCallback(
        (t: number) => {
            setTrimRange(trimStart, t);
        },
        [setTrimRange, trimStart]
    );

    const requestFullscreen = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            video.requestFullscreen();
        }
    }, []);

    // ── Value ──────────────────────────────────────────────────────

    const value: VideoContextValue = {
        videoSrc,
        videoRef,
        duration,
        currentTime,
        isPlaying,
        isMuted,
        volume,
        trimStart,
        trimEnd,
        trimRanges,
        hasVideo,
        loadFile,
        play,
        pause,
        togglePlayPause,
        seek,
        setVolume,
        toggleMute,
        setTrimStart,
        setTrimEnd,
        setTrimRange,
        setTrimRanges,
        requestFullscreen,
    };

    return (
        <VideoContext.Provider value={value}>{children}</VideoContext.Provider>
    );
}
