"use client";

import { useMemo, useState } from "react";
import { Upload, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type UploadResponse = {
  video_id: string;
  source_url: string;
  duration_sec: number;
  filename: string;
};

type EditResponse = {
  action: string;
  reason: string;
  output: {
    start_sec: number;
    end_sec: number;
    output_url: string;
    output_name: string;
  };
};

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [videoId, setVideoId] = useState<string>("");
  const [sourceUrl, setSourceUrl] = useState<string>("");
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("Trim from 00:12 to 00:47");
  const [resultUrl, setResultUrl] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  const canUpload = !!file && !busy;
  const canRun = !!videoId && !!prompt.trim() && !busy;

  const meta = useMemo(() => {
    if (!durationSec) return "No file uploaded yet.";
    return `Duration: ${durationSec.toFixed(3)}s`;
  }, [durationSec]);

  async function uploadVideo() {
    if (!file) return;
    setBusy(true);
    setStatus("Uploading and reading metadata...");
    setResultUrl("");

    const body = new FormData();
    body.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = (await res.json()) as UploadResponse | { detail: string };
      if (!res.ok) throw new Error((data as { detail: string }).detail || "Upload failed");

      const ok = data as UploadResponse;
      setVideoId(ok.video_id);
      setSourceUrl(ok.source_url);
      setDurationSec(ok.duration_sec);
      setStatus(`Uploaded ${ok.filename}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function runTrim() {
    if (!videoId || !prompt.trim()) return;
    setBusy(true);
    setStatus("Asking Gemini and trimming video...");

    try {
      const res = await fetch("/api/edit-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, prompt })
      });
      const data = (await res.json()) as EditResponse | { detail: string };
      if (!res.ok) throw new Error((data as { detail: string }).detail || "Edit failed");

      const ok = data as EditResponse;
      setResultUrl(ok.output.output_url);
      setStatus(`Done: ${ok.output.start_sec.toFixed(3)}s -> ${ok.output.end_sec.toFixed(3)}s`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Edit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">AI Video Trimmer v0</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Natural language trim with Gemini intent parsing and deterministic FFmpeg execution.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. Upload</CardTitle>
            <CardDescription>{meta}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button onClick={uploadVideo} disabled={!canUpload} className="w-full">
              <Upload className="mr-2 h-4 w-4" /> Upload Video
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Describe Trim</CardTitle>
            <CardDescription>Examples: "trim from 00:12 to 00:47", "trim 5 to 23.5"</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <Button onClick={runTrim} disabled={!canRun} className="w-full">
              <Scissors className="mr-2 h-4 w-4" /> Run Trim
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{status || "Idle"}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Original</CardTitle>
          </CardHeader>
          <CardContent>{sourceUrl ? <video controls src={sourceUrl} /> : <p className="text-sm text-muted-foreground">Upload a video to preview.</p>}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {resultUrl ? <video controls src={resultUrl} /> : <p className="text-sm text-muted-foreground">Run a trim to see output.</p>}
            {resultUrl ? (
              <a className="text-sm underline" href={resultUrl} download>
                Download output
              </a>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
