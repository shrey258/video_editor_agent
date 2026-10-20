"use client";

import type React from "react";
import { create } from "zustand";

export type TrimRange = { start: number; end: number };
export type SpeedRange = { start: number; end: number; speed: number };

// Effects mirror backend/app/schemas.py (ZoomEffect, TextEffect, BlurEffect, FrameStyle).
// All positions are 0–1 fractions of the source frame; all times are source seconds.
export type ZoomEffect = { id: string; kind: "zoom"; start: number; end: number; scale: number; cx: number; cy: number };
export type TextEffect = {
  id: string;
  kind: "text";
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
  /** Font size as a fraction of the video height. */
  size: number;
  color: string;
};
export type BlurEffect = { id: string; kind: "blur"; start: number; end: number; x: number; y: number; w: number; h: number };
export type Effect = ZoomEffect | TextEffect | BlurEffect;
export type EffectKind = Effect["kind"];
export type EffectPatch = Partial<Omit<ZoomEffect, "kind" | "id"> & Omit<TextEffect, "kind" | "id"> & Omit<BlurEffect, "kind" | "id">>;

export type FrameAspect = "native" | "16:9" | "9:16" | "1:1" | "4:3" | "4:5";
export type FrameStyle = {
  aspect: FrameAspect;
  /** One color is solid, two is a diagonal gradient. */
  colors: string[];
  /** Percent of the canvas's short side. */
  padding: number;
  /** Percent of the video's short side. */
  radius: number;
  shadow: boolean;
};

export const ZOOM_SCALES = [1.25, 1.5, 1.8, 2.2, 3.5, 5];
export const DEFAULT_FRAME: FrameStyle = { aspect: "native", colors: ["#000000"], padding: 0, radius: 0, shadow: false };

/** Zoom level and focus at time t. Same easing as `_zoom_filter` in video_tools.py. */
export function zoomAt(effects: Effect[], t: number): { scale: number; cx: number; cy: number } {
  const zoom = effects
    .filter((e): e is ZoomEffect => e.kind === "zoom")
    .sort((a, b) => a.start - b.start)
    .find((e) => t >= e.start && t <= e.end);
  if (!zoom) return { scale: 1, cx: 0.5, cy: 0.5 };
  const ramp = Math.min(0.4, (zoom.end - zoom.start) / 3);
  const p = Math.max(0, Math.min(1, (t - zoom.start) / ramp, (zoom.end - t) / ramp));
  return { scale: 1 + (zoom.scale - 1) * p * p * (3 - 2 * p), cx: zoom.cx, cy: zoom.cy };
}

/** CSS transform that shows the same window of the frame as the ffmpeg export. */
export function zoomTransform({ scale, cx, cy }: { scale: number; cx: number; cy: number }): string {
  const view = 1 / scale;
  const left = Math.max(0, Math.min(1 - view, cx - view / 2));
  const top = Math.max(0, Math.min(1 - view, cy - view / 2));
  return `scale(${scale}) translate(${-left * 100}%, ${-top * 100}%)`;
}

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
  speedRanges: SpeedRange[];
  effects: Effect[];
  selectedEffectId: string | null;
  frame: FrameStyle;
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
  setSpeedRanges: (ranges: SpeedRange[]) => void;
  addEffect: (kind: EffectKind) => void;
  updateEffect: (id: string, patch: EffectPatch) => void;
  removeEffect: (id: string) => void;
  selectEffect: (id: string | null) => void;
  clearEffects: () => void;
  setFrame: (patch: Partial<FrameStyle>) => void;
  requestFullscreen: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
}

export type VideoStore = VideoStoreState & VideoStoreActions;

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const EXIT_EPSILON_SEC = 0.02;
const MIN_TRIM_DURATION_SEC = 0.05;
const MIN_SPEED_DURATION_SEC = 0.1;
const DEFAULT_SPEED = 2;

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

function normalizeSpeedRanges(
  ranges: SpeedRange[],
  clamp: (time: number) => number
): SpeedRange[] {
  return ranges
    .map((r) => ({
      start: clamp(Math.min(r.start, r.end)),
      end: clamp(Math.max(r.start, r.end)),
      speed: Math.max(0.25, Math.min(16, r.speed || DEFAULT_SPEED)),
    }))
    .filter((r) => r.end - r.start > MIN_SPEED_DURATION_SEC)
    .sort((a, b) => a.start - b.start);
}

/**
 * Remove any intervals in `targets` that overlap with `subtract`.
 * Partially-overlapping targets are split or shrunk; fully-covered targets
 * are dropped. Returns a new array (never mutates).
 */
function subtractRanges<T extends { start: number; end: number }>(
  targets: T[],
  subtract: Array<{ start: number; end: number }>,
  minDuration: number
): T[] {
  let result: T[] = [...targets];
  for (const sub of subtract) {
    const next: T[] = [];
    for (const t of result) {
      // No overlap → keep as-is
      if (t.end <= sub.start || t.start >= sub.end) {
        next.push(t);
        continue;
      }
      // Left remnant
      if (t.start < sub.start && sub.start - t.start > minDuration) {
        next.push({ ...t, end: sub.start });
      }
      // Right remnant
      if (t.end > sub.end && t.end - sub.end > minDuration) {
        next.push({ ...t, start: sub.end });
      }
      // Fully covered → dropped (neither remnant added)
    }
    result = next;
  }
  return result;
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
  speedRanges: [],
  effects: [],
  selectedEffectId: null,
  frame: DEFAULT_FRAME,
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
      speedRanges: [],
      effects: [],
      selectedEffectId: null,
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
    const state = get();
    const clamp = makeClamp(state.duration);
    const normalized = normalizeTrimRanges([{ start, end }], clamp);
    const prunedSpeed = subtractRanges(state.speedRanges, normalized, MIN_SPEED_DURATION_SEC);
    if (normalized.length === 0) {
      set({ trimStart: 0, trimEnd: 0, trimRanges: [], speedRanges: prunedSpeed });
      return;
    }
    set({
      trimStart: normalized[0].start,
      trimEnd: normalized[0].end,
      trimRanges: normalized,
      speedRanges: prunedSpeed,
    });
  },

  setTrimRanges: (ranges) => {
    const state = get();
    const clamp = makeClamp(state.duration);
    const normalized = normalizeTrimRanges(ranges, clamp);
    // Prune speed ranges that overlap with newly-set trim ranges
    const prunedSpeed = subtractRanges(state.speedRanges, normalized, MIN_SPEED_DURATION_SEC);
    if (normalized.length === 0) {
      set({ trimStart: 0, trimEnd: 0, trimRanges: [], speedRanges: prunedSpeed });
      return;
    }
    set({
      trimStart: normalized[0].start,
      trimEnd: normalized[0].end,
      trimRanges: normalized,
      speedRanges: prunedSpeed,
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

  setSpeedRanges: (ranges) => {
    const state = get();
    const clamp = makeClamp(state.duration);
    const normalized = normalizeSpeedRanges(ranges, clamp);
    // Trim has higher priority than speed; clip speed around trimmed gaps.
    const prunedSpeed = subtractRanges(normalized, state.trimRanges, MIN_SPEED_DURATION_SEC);
    set({
      speedRanges: prunedSpeed,
    });
  },

  addEffect: (kind) => {
    const { currentTime, duration, effects } = get();
    const total = duration > 0 ? duration : 30;
    const start = Math.max(0, Math.min(currentTime, total - 0.5));
    const span = { id: crypto.randomUUID(), start, end: Math.min(total, start + 2) };
    const effect: Effect =
      kind === "zoom"
        ? { ...span, kind, scale: 1.8, cx: 0.5, cy: 0.5 }
        : kind === "text"
          ? { ...span, kind, text: "Your text", x: 0.08, y: 0.08, size: 0.08, color: "#ffffff" }
          : { ...span, kind, x: 0.35, y: 0.35, w: 0.3, h: 0.3 };
    set({ effects: [...effects, effect], selectedEffectId: effect.id });
  },

  updateEffect: (id, patch) => {
    const total = get().duration;
    set({
      effects: get().effects.map((e) => {
        if (e.id !== id) return e;
        const next = { ...e, ...patch } as Effect;
        next.start = Math.max(0, Math.min(next.start, next.end - MIN_SPEED_DURATION_SEC));
        next.end = total > 0 ? Math.min(total, next.end) : next.end;
        return next;
      }),
    });
  },

  removeEffect: (id) =>
    set((state) => ({
      effects: state.effects.filter((e) => e.id !== id),
      selectedEffectId: state.selectedEffectId === id ? null : state.selectedEffectId,
    })),

  selectEffect: (id) => set({ selectedEffectId: id }),
  clearEffects: () => set({ effects: [], selectedEffectId: null }),
  setFrame: (patch) => set((state) => ({ frame: { ...state.frame, ...patch } })),

  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
}));
