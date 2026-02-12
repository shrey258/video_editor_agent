"use client";

import {
    Settings,
    Crop,
    Volume2,
    Wand2,
    Users,
    HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const ITEMS = [
    { icon: Settings, label: "Settings" },
    { icon: Crop, label: "Crop & Resize" },
    { icon: Volume2, label: "Audio" },
    { icon: Wand2, label: "Effects" },
    { icon: Users, label: "Collaborate" },
    { icon: HelpCircle, label: "Help" },
] as const;

export function Toolbar() {
    return (
        <TooltipProvider delayDuration={200}>
            <div className="flex shrink-0 flex-col items-center gap-1 border-l border-zinc-800 bg-zinc-950/80 px-1.5 py-3">
                {ITEMS.map((item) => (
                    <Tooltip key={item.label}>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-zinc-500 hover:text-zinc-200"
                            >
                                <item.icon className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="bg-zinc-800 text-zinc-200">
                            {item.label}
                        </TooltipContent>
                    </Tooltip>
                ))}
            </div>
        </TooltipProvider>
    );
}
