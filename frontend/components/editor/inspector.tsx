"use client";

import { useState, useRef, useEffect } from "react";
import { Download, Sparkles, Send, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
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
    const [messages, setMessages] = useState<ChatMessage[]>(PLACEHOLDER_MESSAGES);
    const [input, setInput] = useState("");
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

    return (
        <div className="flex h-full w-[320px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
            {/* Export button */}
            <div className="p-3">
                <Button className="w-full bg-emerald-600 font-semibold text-white hover:bg-emerald-500">
                    <Download className="mr-2 h-4 w-4" />
                    Export Video
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
