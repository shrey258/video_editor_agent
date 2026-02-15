"use client";

import { useEffect, type ReactNode } from "react";
import { useVideoStore, type VideoStore } from "./video-store";

const SKIP_EPSILON_SEC = 0.05;
const EXIT_EPSILON_SEC = 0.02;

function clampToDuration(time: number, duration: number): number {
  if (duration <= 0) return Math.max(0, time);
  return Math.max(0, Math.min(time, duration));
}

export function useVideo(): VideoStore {
  return useVideoStore((state) => state);
}

export function VideoProvider({ children }: { children: ReactNode }) {
  const videoRef = useVideoStore((s) => s.videoRef);
  const videoSrc = useVideoStore((s) => s.videoSrc);
  const isPlaying = useVideoStore((s) => s.isPlaying);
  const isMuted = useVideoStore((s) => s.isMuted);
  const volume = useVideoStore((s) => s.volume);
  const duration = useVideoStore((s) => s.duration);
  const trimRanges = useVideoStore((s) => s.trimRanges);
  const speedRanges = useVideoStore((s) => s.speedRanges);
  const hasTrimmedGap = trimRanges.length > 0;

  const setCurrentTime = useVideoStore((s) => s.setCurrentTime);
  const setDuration = useVideoStore((s) => s.setDuration);
  const setIsPlaying = useVideoStore((s) => s.setIsPlaying);
  const setTrimRanges = useVideoStore((s) => s.setTrimRanges);

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
          const target = clampToDuration(rangeToSkip.end + EXIT_EPSILON_SEC, duration);
          video.currentTime = target;
          nextTime = target;
        }
      }
      return nextTime;
    };

    const enforcePlaybackRate = (time: number) => {
      if (speedRanges.length === 0) return;
      const activeRange = speedRanges.find(
        (r) => time >= r.start && time < r.end
      );
      const targetRate = activeRange ? activeRange.speed : 1;
      if (video.playbackRate !== targetRate) {
        video.playbackRate = targetRate;
      }
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
      enforcePlaybackRate(nextTime);
      setCurrentTime(toDisplayTime(nextTime));
    };

    let rafId: number;
    const updateFrame = () => {
      if (isPlaying) {
        const nextTime = enforceTrimSkip();
        enforcePlaybackRate(nextTime);
        setCurrentTime(toDisplayTime(nextTime));
        rafId = requestAnimationFrame(updateFrame);
      }
    };

    if (isPlaying) {
      rafId = requestAnimationFrame(updateFrame);
    }

    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setTrimRanges([]);
    };
    const onEnded = () => {
      video.playbackRate = 1;
      setIsPlaying(false);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      video.playbackRate = 1;
      setIsPlaying(false);
    };

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
  }, [
    videoRef,
    videoSrc,
    isPlaying,
    hasTrimmedGap,
    trimRanges,
    speedRanges,
    duration,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setTrimRanges,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = isMuted ? 0 : volume / 100;
    video.muted = isMuted;
  }, [videoRef, volume, isMuted]);

  return <>{children}</>;
}
