import { describe, expect, it } from "vitest";

import { useVideoStore, zoomAt, zoomTransform, type Effect } from "./video-store";

function resetStore() {
  const state = useVideoStore.getState();
  state.setDuration(10);
  state.setCurrentTime(0);
  state.setIsPlaying(false);
  state.setTrimRanges([]);
  state.videoRef.current = null;
}

describe("video-store", () => {
  it("merges overlapping and adjacent trim ranges", () => {
    resetStore();
    const state = useVideoStore.getState();
    state.setTrimRanges([
      { start: 1, end: 3 },
      { start: 2.98, end: 4 },
      { start: 8, end: 12 },
    ]);

    const ranges = useVideoStore.getState().trimRanges;
    expect(ranges).toHaveLength(2);
    expect(ranges[0].start).toBeCloseTo(1, 2);
    expect(ranges[0].end).toBeCloseTo(4, 2);
    expect(ranges[1].start).toBeCloseTo(8, 2);
    expect(ranges[1].end).toBeCloseTo(10, 2);
  });

  it("seek snaps outside trimmed gap using nearest boundary behavior", () => {
    resetStore();
    const state = useVideoStore.getState();
    const video = {
      currentTime: 0,
      paused: true,
      play: () => Promise.resolve(),
      pause: () => undefined,
      requestFullscreen: () => Promise.resolve(),
      volume: 1,
      muted: false,
    };
    state.videoRef.current = video as unknown as HTMLVideoElement;
    state.setTrimRanges([{ start: 2, end: 4 }]);

    state.seek(2.2);
    expect(video.currentTime).toBeCloseTo(2, 2);

    state.seek(3.8);
    expect(video.currentTime).toBeGreaterThan(4);
  });

  it("normalizes and clamps speed ranges", () => {
    resetStore();
    const state = useVideoStore.getState();
    state.setSpeedRanges([
      { start: 3, end: 1, speed: 2 },   // inverted start/end
      { start: 8, end: 15, speed: 3 },  // exceeds duration (10s)
      { start: 5, end: 5.05, speed: 2 }, // too short (< 0.1s)
    ]);

    const ranges = useVideoStore.getState().speedRanges;
    expect(ranges).toHaveLength(2);
    // Inverted range normalized
    expect(ranges[0].start).toBeCloseTo(1, 2);
    expect(ranges[0].end).toBeCloseTo(3, 2);
    expect(ranges[0].speed).toBe(2);
    // Clamped to duration
    expect(ranges[1].start).toBeCloseTo(8, 2);
    expect(ranges[1].end).toBeCloseTo(10, 2);
    expect(ranges[1].speed).toBe(3);
  });

  it("clamps speed values to [0.25, 16]", () => {
    resetStore();
    const state = useVideoStore.getState();
    state.setSpeedRanges([
      { start: 0, end: 2, speed: 0.1 },   // below min
      { start: 3, end: 5, speed: 20 },    // above max
    ]);

    const ranges = useVideoStore.getState().speedRanges;
    expect(ranges).toHaveLength(2);
    expect(ranges[0].speed).toBe(0.25);
    expect(ranges[1].speed).toBe(16);
  });

  it("splits full-speed range when multiple trims are added", () => {
    resetStore();
    const state = useVideoStore.getState();
    state.setSpeedRanges([{ start: 0, end: 10, speed: 2 }]);
    state.setTrimRanges([
      { start: 3, end: 4 },
      { start: 7, end: 8 },
    ]);

    const ranges = useVideoStore.getState().speedRanges;
    expect(ranges).toEqual([
      { start: 0, end: 3, speed: 2 },
      { start: 4, end: 7, speed: 2 },
      { start: 8, end: 10, speed: 2 },
    ]);
  });

  it("clips incoming speed ranges to avoid trimmed sections", () => {
    resetStore();
    const state = useVideoStore.getState();
    state.setTrimRanges([{ start: 3, end: 7 }]);
    state.setSpeedRanges([{ start: 2, end: 8, speed: 2 }]);

    const ranges = useVideoStore.getState().speedRanges;
    expect(ranges).toEqual([
      { start: 2, end: 3, speed: 2 },
      { start: 7, end: 8, speed: 2 },
    ]);
  });

  it("eases zoom in, holds, and eases out like the export", () => {
    const effects: Effect[] = [{ id: "z", kind: "zoom", start: 2, end: 6, scale: 2, cx: 0.9, cy: 0.1 }];
    expect(zoomAt(effects, 1).scale).toBe(1);
    expect(zoomAt(effects, 2.2).scale).toBeCloseTo(1.5);
    expect(zoomAt(effects, 4).scale).toBe(2);
    expect(zoomAt(effects, 6).scale).toBe(1);
    // The window clamps to the frame edge instead of centring on (0.9, 0.1).
    expect(zoomTransform(zoomAt(effects, 4))).toBe("scale(2) translate(-50%, 0%)");
  });

  it("adds effects at the playhead and keeps them inside the video", () => {
    resetStore();
    const state = useVideoStore.getState();
    state.clearEffects();
    state.setCurrentTime(9.8);
    state.addEffect("text");
    const added = useVideoStore.getState().effects[0];
    expect(added).toMatchObject({ kind: "text", start: 9.5, end: 10 });
    expect(useVideoStore.getState().selectedEffectId).toBe(added.id);

    state.updateEffect(added.id, { end: 14 });
    expect(useVideoStore.getState().effects[0].end).toBe(10);
    state.removeEffect(added.id);
    expect(useVideoStore.getState()).toMatchObject({ effects: [], selectedEffectId: null });
  });
});
