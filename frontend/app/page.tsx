"use client";

import { Stage } from "@/components/editor/stage";
import { Inspector } from "@/components/editor/inspector";
import { Timeline } from "@/components/editor/timeline";
import { VideoProvider } from "@/components/editor/video-context";

export default function EditorPage() {
  return (
    <VideoProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950">
        {/* Top section: Stage + Inspector */}
        <div className="flex flex-1 overflow-hidden">
          {/* Stage (Preview) — fills remaining space */}
          <Stage />

          {/* Right sidebar — Inspector / AI Chat */}
          <Inspector />
        </div>

        {/* Bottom section: Timeline */}
        <Timeline />
      </div>
    </VideoProvider>
  );
}
