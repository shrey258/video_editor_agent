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

const PLACEHOLDER_MESSAGES: ChatMessage[] = [
    {
        id: "1",
        role: "assistant",
        content:
            "Hey! I'm your AI video editor. Upload a video and tell me what edits you'd like — trim, cut, extract a clip, and more.",
    },
];

export function Inspector() {
    const { sourceFile } = useVideo();
    const [messages, setMessages] = useState<ChatMessage[]>(PLACEHOLDER_MESSAGES);
    const [input, setInput] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isEstimating, setIsEstimating] = useState(false);
    const [spriteData, setSpriteData] = useState<SpriteAnalysisResponse | null>(null);
    const [tokenEstimate, setTokenEstimate] = useState<TokenEstimateResponse | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    function handleSend() {
        if (!input.trim()) return;
        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: "user",
            content: input.trim(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");

        // Mock assistant reply
        setTimeout(() => {
            const reply: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: `I'll process: "${userMsg.content}". This would parse intent via Gemini and execute an FFmpeg operation.`,
            };
            setMessages((prev) => [...prev, reply]);
        }, 600);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    async function handleGenerateSprites() {
        if (!sourceFile || isAnalyzing) return;
        setIsAnalyzing(true);
        setSpriteData(null);

        const form = new FormData();
        form.append("file", sourceFile);
        form.append("interval_sec", "1.0");
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
        if (!sourceFile || isEstimating) return;
        setIsEstimating(true);

        const form = new FormData();
        form.append("file", sourceFile);
        form.append("interval_sec", "1.0");
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

    return (
        <div className="flex h-full w-[320px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
            {/* Export button */}
            <div className="p-3">
                <Button className="w-full bg-emerald-600 font-semibold text-white hover:bg-emerald-500">
                    <Download className="mr-2 h-4 w-4" />
                    Export Video
                </Button>
                <Button
                    variant="secondary"
                    className="mt-2 w-full"
                    onClick={handleGenerateSprites}
                    disabled={!sourceFile || isAnalyzing}
                >
                    <Film className="mr-2 h-4 w-4" />
                    {isAnalyzing ? "Generating Sprites..." : "Generate Sprites"}
                </Button>
                <Button
                    variant="secondary"
                    className="mt-2 w-full"
                    onClick={handleEstimateTokens}
                    disabled={!sourceFile || isEstimating}
                >
                    <Sigma className="mr-2 h-4 w-4" />
                    {isEstimating ? "Estimating Tokens..." : "Estimate Tokens"}
                </Button>
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
                            <div className="mt-2 space-y-2">
                                {spriteData.sheets.slice(0, 2).map((sheet) => (
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
                <div className="flex items-end gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 focus-within:border-primary/50 transition-colors duration-200">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Describe your edit..."
                        rows={1}
                        className="max-h-24 w-full resize-none bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleSend}
                        disabled={!input.trim()}
                        className="h-7 w-7 shrink-0 text-primary hover:bg-primary/20 hover:text-primary disabled:text-zinc-600"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
                <p className="mt-2 text-center text-[11px] text-zinc-600">
                    Try: &quot;Trim from 00:12 to 00:47&quot;
                </p>
            </div>
        </div>
    );
}
