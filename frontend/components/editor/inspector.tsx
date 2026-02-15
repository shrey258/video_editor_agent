"use client";

import { useState, useRef, useEffect } from "react";
import { Download, Sparkles, Send, Bot, User, Film, Sigma } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useVideo } from "./video-context";

type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
};

type SpriteSheet = {
    sheet_index: number;
    image_url: string;
    image_width: number;
    image_height: number;
    start_time_sec: number;
    end_time_sec: number;
};

type SpriteAnalysisResponse = {
    duration_sec: number;
    interval_sec: number;
    total_frames: number;
    sheets: SpriteSheet[];
};

type TokenEstimateResponse = {
    duration_sec: number;
    direct_video_tokens_est: number;
    sprite_tokens_est: number;
    total_frames: number;
    sheet_count: number;
    recommendation: string;
    notes: string[];
};

type CutSuggestion = {
    start_sec: number;
    end_sec: number;
    reason: string;
    confidence: number;
};

type SuggestCutsResponse = {
    suggestions: CutSuggestion[];
    model: string;
    strategy: string;
};

type ExportResponse = {
    output_url: string;
    output_name: string;
    removed_ranges_count: number;
};

const PLACEHOLDER_MESSAGES: ChatMessage[] = [
    {
        id: "1",
        role: "assistant",
        content:
            "Hey! I'm your AI video editor. Upload a video and tell me what edits you'd like — trim, cut, extract a clip, and more.",
    },
];
const MAX_VIDEO_DURATION_SEC = 10;

export function Inspector() {
    const { sourceFile, duration, trimRanges, setTrimRanges } = useVideo();
    const [messages, setMessages] = useState<ChatMessage[]>(PLACEHOLDER_MESSAGES);
    const [input, setInput] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isEstimating, setIsEstimating] = useState(false);
    const [spriteData, setSpriteData] = useState<SpriteAnalysisResponse | null>(null);
    const [tokenEstimate, setTokenEstimate] = useState<TokenEstimateResponse | null>(null);
    const [suggestions, setSuggestions] = useState<CutSuggestion[]>([]);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportResult, setExportResult] = useState<ExportResponse | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const isVideoTooLong = duration > MAX_VIDEO_DURATION_SEC;
    const durationLabel =
        Number.isFinite(duration) && duration > 0 ? `${duration.toFixed(2)}s` : "unknown";

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Auto-resize textarea to fit content
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    }, [input]);

    async function handleSend() {
        if (!input.trim()) return;
        if (isVideoTooLong) {
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: "assistant",
                    content: `AI tools are limited to videos up to ${MAX_VIDEO_DURATION_SEC}s. Current video: ${durationLabel}.`,
                },
            ]);
            return;
        }
        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: "user",
            content: input.trim(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        if (!spriteData) {
            setMessages((prev) => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: "Generate sprites first, then I can suggest cut ranges.",
                },
            ]);
            return;
        }

        setIsSuggesting(true);
        try {
            const response = await fetch("/api/ai/suggest-cuts-from-sprites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: userMsg.content,
                    duration_sec: spriteData.duration_sec,
                    sprite_interval_sec: spriteData.interval_sec,
                    total_frames: spriteData.total_frames,
                    sheets_count: spriteData.sheets.length,
                }),
            });
            const data = (await response.json()) as SuggestCutsResponse | { detail?: string };
            if (!response.ok) {
                const message = "detail" in data ? data.detail : undefined;
                throw new Error(message || "Failed to suggest cuts.");
            }
            const result = data as SuggestCutsResponse;
            setSuggestions(result.suggestions);
            setTrimRanges(result.suggestions.map((s) => ({ start: s.start_sec, end: s.end_sec })));
            setMessages((prev) => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: `Suggested ${result.suggestions.length} cut(s) via ${result.model}. Applied to timeline.`,
                },
            ]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content:
                        error instanceof Error
                            ? error.message
                            : "Failed to suggest cuts.",
                },
            ]);
        } finally {
            setIsSuggesting(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    async function handleGenerateSprites() {
        if (!sourceFile || isAnalyzing || isVideoTooLong) return;
        setIsAnalyzing(true);
        setSpriteData(null);

        const form = new FormData();
        form.append("file", sourceFile);
        form.append("interval_sec", "0.25");
        form.append("columns", "8");
        form.append("rows", "8");
        form.append("thumb_width", "256");

        try {
            const response = await fetch("/api/analyze/sprites", {
                method: "POST",
                body: form,
            });
            const data = (await response.json()) as SpriteAnalysisResponse | { detail?: string };
            if (!response.ok) {
                const message =
                    "detail" in data ? data.detail : undefined;
                throw new Error(message || "Failed to generate sprite sheets.");
            }
            const spriteResponse = data as SpriteAnalysisResponse;
            setSpriteData(spriteResponse);
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: "assistant",
                    content: `Generated ${spriteResponse.sheets.length} sprite sheet(s) for ${spriteResponse.duration_sec}s video.`,
                },
            ]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: "assistant",
                    content:
                        error instanceof Error
                            ? error.message
                            : "Failed to generate sprite sheets.",
                },
            ]);
        } finally {
            setIsAnalyzing(false);
        }
    }

    async function handleEstimateTokens() {
        if (!sourceFile || isEstimating || isVideoTooLong) return;
        setIsEstimating(true);

        const form = new FormData();
        form.append("file", sourceFile);
        form.append("interval_sec", "0.25");
        form.append("columns", "8");
        form.append("rows", "8");
        form.append("thumb_width", "256");

        try {
            const response = await fetch("/api/analyze/token-estimate-from-file", {
                method: "POST",
                body: form,
            });
            const data = (await response.json()) as TokenEstimateResponse | { detail?: string };
            if (!response.ok) {
                const message = "detail" in data ? data.detail : undefined;
                throw new Error(message || "Failed to estimate tokens.");
            }
            const estimate = data as TokenEstimateResponse;
            setTokenEstimate(estimate);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: "assistant",
                    content:
                        error instanceof Error
                            ? error.message
                            : "Failed to estimate token usage.",
                },
            ]);
        } finally {
            setIsEstimating(false);
        }
    }

    async function handleExportVideo() {
        if (!sourceFile || isExporting || isVideoTooLong) return;
        setIsExporting(true);
        setExportResult(null);

        const form = new FormData();
        form.append("file", sourceFile);
        form.append("trim_ranges", JSON.stringify(trimRanges));

        try {
            const response = await fetch("/api/export/from-file", {
                method: "POST",
                body: form,
            });
            const data = (await response.json()) as ExportResponse | { detail?: string };
            if (!response.ok) {
                const message = "detail" in data ? data.detail : undefined;
                throw new Error(message || "Failed to export video.");
            }
            const result = data as ExportResponse;
            setExportResult(result);

            const downloadResponse = await fetch(result.output_url);
            if (!downloadResponse.ok) {
                throw new Error("Export succeeded but download failed.");
            }
            const blob = await downloadResponse.blob();
            const blobUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = blobUrl;
            anchor.download = result.output_name || "export.mp4";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(blobUrl);

            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: "assistant",
                    content: `Export complete. Download started. Applied ${result.removed_ranges_count} trim range(s).`,
                },
            ]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: "assistant",
                    content:
                        error instanceof Error
                            ? error.message
                            : "Export failed.",
                },
            ]);
        } finally {
            setIsExporting(false);
        }
    }

    return (
        <div className="flex h-full w-[320px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
            {/* Export button */}
            <div className="p-3">
                <Button
                    className="w-full bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
                    onClick={handleExportVideo}
                    disabled={!sourceFile || isExporting || isVideoTooLong}
                >
                    <Download className="mr-2 h-4 w-4" />
                    {isExporting ? "Exporting..." : "Export Video"}
                </Button>
                {exportResult ? (
                    <a
                        href={exportResult.output_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-center text-xs text-emerald-300 hover:bg-emerald-500/20"
                    >
                        Open Export: {exportResult.output_name}
                    </a>
                ) : null}
                <Button
                    variant="secondary"
                    className="mt-2 w-full"
                    onClick={handleGenerateSprites}
                    disabled={!sourceFile || isAnalyzing || isVideoTooLong}
                >
                    <Film className="mr-2 h-4 w-4" />
                    {isAnalyzing ? "Generating Sprites..." : "Generate Sprites"}
                </Button>
                <Button
                    variant="secondary"
                    className="mt-2 w-full"
                    onClick={handleEstimateTokens}
                    disabled={!sourceFile || isEstimating || isVideoTooLong}
                >
                    <Sigma className="mr-2 h-4 w-4" />
                    {isEstimating ? "Estimating Tokens..." : "Estimate Tokens"}
                </Button>
                {isVideoTooLong ? (
                    <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                        AI/Export is limited to {MAX_VIDEO_DURATION_SEC}s max. Current: {durationLabel}.
                    </p>
                ) : null}
            </div>

            <Separator className="bg-zinc-800" />

            {/* Chat header */}
            <div className="flex items-center gap-2 px-4 py-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-zinc-200">Edit with AI</h3>
            </div>

            <Separator className="bg-zinc-800" />

            {/* Chat messages */}
            <ScrollArea className="flex-1 px-3">
                <div className="space-y-3 py-3">
                    {spriteData ? (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
                            <p className="text-xs text-zinc-400">
                                Sprites: {spriteData.sheets.length} sheets, {spriteData.total_frames} frames
                            </p>
                            {spriteData.sheets.some((sheet) => sheet.image_url) ? (
                                <div className="mt-2 space-y-2">
                                    {spriteData.sheets
                                        .filter((sheet) => Boolean(sheet.image_url))
                                        .slice(0, 2)
                                        .map((sheet) => (
                                            <div key={sheet.sheet_index} className="space-y-1">
                                                <Image
                                                    src={sheet.image_url}
                                                    alt={`Sprite sheet ${sheet.sheet_index}`}
                                                    width={sheet.image_width}
                                                    height={sheet.image_height}
                                                    unoptimized
                                                    className="w-full rounded border border-zinc-700"
                                                />
                                                <p className="text-[11px] text-zinc-500">
                                                    Sheet {sheet.sheet_index}: {sheet.start_time_sec}s to {sheet.end_time_sec}s
                                                </p>
                                            </div>
                                        ))}
                                </div>
                            ) : (
                                <p className="mt-2 text-[11px] text-zinc-500">
                                    Sprite files are temporary and not persisted in this environment.
                                </p>
                            )}
                        </div>
                    ) : null}
                    {tokenEstimate ? (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                            <p className="text-xs font-semibold text-zinc-300">Token Comparison</p>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded border border-zinc-700 p-2">
                                    <p className="text-zinc-500">Direct Upload</p>
                                    <p className="font-mono text-zinc-100">
                                        {tokenEstimate.direct_video_tokens_est.toLocaleString()}
                                    </p>
                                </div>
                                <div className="rounded border border-zinc-700 p-2">
                                    <p className="text-zinc-500">Sprite Sheets</p>
                                    <p className="font-mono text-zinc-100">
                                        {tokenEstimate.sprite_tokens_est.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            <p className="mt-2 text-[11px] text-zinc-400">
                                Frames: {tokenEstimate.total_frames} | Sheets: {tokenEstimate.sheet_count}
                            </p>
                            <p className="mt-1 text-[11px] text-emerald-300">
                                {tokenEstimate.recommendation}
                            </p>
                        </div>
                    ) : null}
                    {suggestions.length > 0 ? (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                            <p className="text-xs font-semibold text-zinc-300">AI Suggestions</p>
                            <div className="mt-2 space-y-1">
                                {suggestions.map((s, idx) => (
                                    <div
                                        key={`${s.start_sec}-${s.end_sec}-${idx}`}
                                        className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300"
                                    >
                                        <span className="font-mono text-zinc-100">
                                            {s.start_sec.toFixed(2)}s → {s.end_sec.toFixed(2)}s
                                        </span>
                                        <span className="ml-2 text-zinc-400">
                                            ({Math.round(s.confidence * 100)}%)
                                        </span>
                                        <p className="text-zinc-500">{s.reason}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                        >
                            <div
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${msg.role === "assistant"
                                    ? "bg-primary/20 text-primary"
                                    : "bg-zinc-700 text-zinc-300"
                                    }`}
                            >
                                {msg.role === "assistant" ? (
                                    <Bot className="h-3.5 w-3.5" />
                                ) : (
                                    <User className="h-3.5 w-3.5" />
                                )}
                            </div>
                            <div
                                className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed ${msg.role === "assistant"
                                    ? "bg-zinc-800/80 text-zinc-300"
                                    : "bg-primary/15 text-zinc-200"
                                    }`}
                            >
                                {msg.content}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </ScrollArea>

            <Separator className="bg-zinc-800" />

            {/* Chat input */}
            <div className="p-3">
                <div className="flex items-end gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-transparent transition-all duration-200 ease focus-within:border-transparent focus-within:ring-primary/40 focus-within:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),0_0_0_1px_hsl(142_71%_45%/0.15)]">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Describe your edit..."
                        rows={1}
                        className="scrollbar-hide max-h-28 min-h-[1.5rem] w-full resize-none overflow-y-auto bg-transparent text-[13px] leading-relaxed text-zinc-200 placeholder:text-zinc-500 placeholder:transition-colors placeholder:duration-200 focus:outline-none focus:placeholder:text-zinc-600"
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleSend}
                        disabled={!input.trim() || isSuggesting || isVideoTooLong}
                        className="h-7 w-7 shrink-0 rounded-lg text-primary transition-all duration-200 ease hover:bg-primary/15 hover:text-primary active:scale-95 disabled:text-zinc-600"
                    >
                        <Send className="h-3.5 w-3.5" />
                    </Button>
                </div>
                <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-600">
                    <span>Try: &quot;Trim from 00:12 to 00:47&quot;</span>
                    <kbd className="rounded border border-zinc-800 bg-zinc-900/80 px-1 py-px font-mono text-[10px] leading-none text-zinc-500">⏎</kbd>
                </div>
            </div>
        </div>
    );
}
