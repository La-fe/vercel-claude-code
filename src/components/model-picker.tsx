/**
 * 模型选择器 — 对标 Claude Code ModelPicker
 *
 * CC: 在 StatusLine 中显示当前模型，支持运行时切换
 * 我们: shadcn Popover 选择模型，更新到 agentStatus
 */
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Zap, Brain, Sparkles } from "lucide-react";

const MODELS = [
  { id: "anthropic/claude-sonnet-4-6", label: "Sonnet 4.6", icon: Brain, desc: "Balanced (default)", speed: "fast" },
  { id: "anthropic/claude-haiku-4-5", label: "Haiku 4.5", icon: Zap, desc: "Fast & cheap", speed: "fastest" },
  { id: "anthropic/claude-opus-4-6", label: "Opus 4.6", icon: Sparkles, desc: "Most capable", speed: "slow" },
] as const;

interface ModelPickerProps {
  currentModel: string;
  onModelChange: (model: string) => void;
}

export function ModelPicker({ currentModel, onModelChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const current = MODELS.find((m) => m.id === currentModel) ?? MODELS[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors font-mono cursor-pointer">
        model: <span className="text-foreground/60">{current.label}</span>
        <ChevronDown className="w-2.5 h-2.5" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start" side="top">
        {MODELS.map((m) => (
          <button
            key={m.id}
            onClick={() => { onModelChange(m.id); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
              m.id === currentModel ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
            }`}
          >
            <m.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium">{m.label}</div>
              <div className="text-[10px] text-muted-foreground">{m.desc}</div>
            </div>
            {m.id === currentModel && (
              <Badge variant="outline" className="text-[8px] h-3.5 shrink-0">active</Badge>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
