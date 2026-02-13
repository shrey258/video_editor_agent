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
    requestFullscreen: () => void;
}

type VideoContextValue = VideoState & VideoActions;

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

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
    const [isSeeking, setIsSeeking] = useState(false);

    const hasVideo = videoSrc !== null;

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

        const onTimeUpdate = () => {
            if (!isSeeking) setCurrentTime(video.currentTime);
        };
        const onLoadedMetadata = () => {
            setDuration(video.duration);
            // Default trim: full clip
            setTrimStartState(0);
            setTrimEndState(video.duration);
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
        };
    }, [videoSrc, isSeeking]);

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
        videoRef.current?.play();
    }, []);

    const pause = useCallback(() => {
        videoRef.current?.pause();
    }, []);

    const togglePlayPause = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        video.paused ? video.play() : video.pause();
    }, []);

    const seek = useCallback((time: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = time;
        setCurrentTime(time);
    }, []);

    const setVolume = useCallback((v: number) => {
        setVolumeState(v);
        if (v > 0) setIsMuted(false);
    }, []);

    const toggleMute = useCallback(() => {
        setIsMuted((prev) => !prev);
    }, []);

    const setTrimStart = useCallback(
        (t: number) => {
            setTrimStartState(Math.max(0, Math.min(t, trimEnd - 0.1)));
        },
        [trimEnd]
    );

    const setTrimEnd = useCallback(
        (t: number) => {
            setTrimEndState(Math.max(trimStart + 0.1, Math.min(t, duration)));
        },
        [trimStart, duration]
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
        requestFullscreen,
    };

    return (
        <VideoContext.Provider value={value}>{children}</VideoContext.Provider>
    );
}
