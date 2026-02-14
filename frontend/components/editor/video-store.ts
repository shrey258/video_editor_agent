"use client";

import type React from "react";
import { create } from "zustand";

export type TrimRange = { start: number; end: number };

export interface VideoStoreState {
  videoSrc: string | null;
  sourceFile: File | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  trimStart: number;
  trimEnd: number;
  trimRanges: TrimRange[];
  hasVideo: boolean;
}

export interface VideoStoreActions {
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
  setTrimRanges: (ranges: TrimRange[]) => void;
  requestFullscreen: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
}

export type VideoStore = VideoStoreState & VideoStoreActions;

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const EXIT_EPSILON_SEC = 0.02;
const MIN_TRIM_DURATION_SEC = 0.05;

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

function makeClamp(duration: number) {
  return (time: number) => {
    if (duration <= 0) return Math.max(0, time);
    return Math.max(0, Math.min(time, duration));
  };
}

const videoRef = { current: null } as React.RefObject<HTMLVideoElement | null>;

export const useVideoStore = create<VideoStore>((set, get) => ({
  videoSrc: null,
  sourceFile: null,
  videoRef,
  duration: 0,
  currentTime: 0,
  isPlaying: false,
  isMuted: false,
  volume: 80,
  trimStart: 0,
  trimEnd: 0,
  trimRanges: [],
  hasVideo: false,

  loadFile: (file) => {
    if (!ACCEPTED_TYPES.includes(file.type)) return;
    const prev = get().videoSrc;
    if (prev) URL.revokeObjectURL(prev);
    const src = URL.createObjectURL(file);
    set({
      videoSrc: src,
      sourceFile: file,
      hasVideo: true,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      trimStart: 0,
      trimEnd: 0,
      trimRanges: [],
    });
  },

  play: () => {
    const state = get();
    const video = state.videoRef.current;
    if (!video) return;
    const clamp = makeClamp(state.duration);
    if (state.trimRanges.length > 0) {
      const range = state.trimRanges.find(
        (r) => video.currentTime > r.start && video.currentTime < r.end
      );
      if (range) {
        const next = clamp(range.end + EXIT_EPSILON_SEC);
        video.currentTime = next;
        set({ currentTime: range.end });
      }
    }
    void video.play();
  },

  pause: () => {
    get().videoRef.current?.pause();
  },

  togglePlayPause: () => {
    const state = get();
    const video = state.videoRef.current;
    if (!video) return;
    const clamp = makeClamp(state.duration);
    if (video.paused) {
      if (state.trimRanges.length > 0) {
        const range = state.trimRanges.find(
          (r) => video.currentTime > r.start && video.currentTime < r.end
        );
        if (range) {
          const next = clamp(range.end + EXIT_EPSILON_SEC);
          video.currentTime = next;
          set({ currentTime: range.end });
        }
      }
      void video.play();
    } else {
      video.pause();
    }
  },

  seek: (time) => {
    const state = get();
    const video = state.videoRef.current;
    if (!video) return;
    const clamp = makeClamp(state.duration);
    const clamped = clamp(time);
    const containing = state.trimRanges.find(
      (range) => clamped > range.start && clamped < range.end
    );
    const nextTime = containing
      ? clamped < (containing.start + containing.end) / 2
        ? containing.start
        : clamp(containing.end + EXIT_EPSILON_SEC)
      : clamped;
    video.currentTime = nextTime;
    set({ currentTime: nextTime });
  },

  setVolume: (v) => {
    set((state) => ({
      volume: v,
      isMuted: v > 0 ? false : state.isMuted,
    }));
  },

  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
  },

  setTrimRange: (start, end) => {
    const clamp = makeClamp(get().duration);
    const normalized = normalizeTrimRanges([{ start, end }], clamp);
    if (normalized.length === 0) {
      set({ trimStart: 0, trimEnd: 0, trimRanges: [] });
      return;
    }
    set({
      trimStart: normalized[0].start,
      trimEnd: normalized[0].end,
      trimRanges: normalized,
    });
  },

  setTrimRanges: (ranges) => {
    const clamp = makeClamp(get().duration);
    const normalized = normalizeTrimRanges(ranges, clamp);
    if (normalized.length === 0) {
      set({ trimStart: 0, trimEnd: 0, trimRanges: [] });
      return;
    }
    set({
      trimStart: normalized[0].start,
      trimEnd: normalized[0].end,
      trimRanges: normalized,
    });
  },

  setTrimStart: (t) => {
    const state = get();
    state.setTrimRange(t, state.trimEnd);
  },

  setTrimEnd: (t) => {
    const state = get();
    state.setTrimRange(state.trimStart, t);
  },

  requestFullscreen: () => {
    const video = get().videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void video.requestFullscreen();
    }
  },

  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
}));
