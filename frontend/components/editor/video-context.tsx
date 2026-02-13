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
    requestFullscreen: () => void;
}

type VideoContextValue = VideoState & VideoActions;

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const SKIP_EPSILON_SEC = 0.05;
const EXIT_EPSILON_SEC = 0.02;

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

    const hasVideo = videoSrc !== null;
    const hasTrimmedGap = trimEnd - trimStart > 0.05;

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
            if (clamped <= trimStart || clamped >= trimEnd) return clamped;
            const midpoint = (trimStart + trimEnd) / 2;
            return clamped < midpoint
                ? trimStart
                : clampToDuration(trimEnd + EXIT_EPSILON_SEC);
        },
        [clampToDuration, hasTrimmedGap, trimStart, trimEnd]
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
    }, []);

    // ── Sync <video> element ───────────────────────────────────────

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const enforceTrimSkip = () => {
            let nextTime = video.currentTime;
            if (
                hasTrimmedGap &&
                nextTime >= trimStart - SKIP_EPSILON_SEC &&
                nextTime < trimEnd - EXIT_EPSILON_SEC
            ) {
                // Nudge just past trimEnd to avoid boundary re-seek loops.
                const target =
                    duration <= 0
                        ? Math.max(0, trimEnd + EXIT_EPSILON_SEC)
                        : Math.max(0, Math.min(trimEnd + EXIT_EPSILON_SEC, duration));
                video.currentTime = target;
                nextTime = target;
            }
            return nextTime;
        };

        const toDisplayTime = (time: number) => {
            if (
                hasTrimmedGap &&
                time > trimEnd &&
                time <= trimEnd + EXIT_EPSILON_SEC
            ) {
                return trimEnd;
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
    }, [videoSrc, isPlaying, hasTrimmedGap, trimStart, trimEnd, duration]);

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
        if (hasTrimmedGap && video.currentTime > trimStart && video.currentTime < trimEnd) {
            video.currentTime = trimEnd;
            setCurrentTime(trimEnd);
        }
        void video.play();
    }, [hasTrimmedGap, trimStart, trimEnd]);

    const pause = useCallback(() => {
        videoRef.current?.pause();
    }, []);

    const togglePlayPause = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            if (hasTrimmedGap && video.currentTime > trimStart && video.currentTime < trimEnd) {
                video.currentTime = trimEnd;
                setCurrentTime(trimEnd);
            }
            void video.play();
        } else {
            video.pause();
        }
    }, [hasTrimmedGap, trimStart, trimEnd]);

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
            const boundedStart = clampToDuration(start);
            const boundedEnd = clampToDuration(end);
            if (boundedEnd - boundedStart <= 0.05) {
                setTrimStartState(0);
                setTrimEndState(0);
                return;
            }
            setTrimStartState(boundedStart);
            setTrimEndState(boundedEnd);
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
        requestFullscreen,
    };

    return (
        <VideoContext.Provider value={value}>{children}</VideoContext.Provider>
    );
}
