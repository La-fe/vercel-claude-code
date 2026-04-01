/**
 * Cmd+K 命令面板 — 对标 Claude Code 的 FuzzyPicker
 *
 * CC: FuzzyPicker overlay + nucleo fuzzy search
 * 我们: shadcn Command (cmdk) + 简单 filter
 *
 * 快捷键: Cmd+K (Mac) / Ctrl+K (Win)
 */
"use client";

import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Terminal, FileText, Zap, Shield, History, Trash2, DollarSign,
  HelpCircle, Eye, Bot, Globe,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommand: (command: string) => void;
  permissionMode: string;
}

const COMMANDS = [
  { name: "help", label: "Help", description: "Show available commands", icon: HelpCircle, group: "General" },
  { name: "clear", label: "Clear", description: "Clear conversation", icon: Trash2, group: "General" },
  { name: "cost", label: "Cost", description: "Show token usage and cost", icon: DollarSign, group: "General" },
  { name: "compact", label: "Compact", description: "Compress conversation history", icon: Zap, group: "General" },
  { name: "resume", label: "Resume", description: "Resume previous session", icon: History, group: "General" },
  { name: "auto", label: "Auto Mode", description: "All tools, no confirmation", icon: Bot, group: "Modes" },
  { name: "plan", label: "Plan Mode", description: "Read-only tools only", icon: Eye, group: "Modes" },
  { name: "default", label: "Default Mode", description: "Confirm dangerous operations", icon: Shield, group: "Modes" },
];

export function CommandPalette({ open, onOpenChange, onCommand, permissionMode }: CommandPaletteProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command..." />
      <CommandList>
        <CommandEmpty>No commands found.</CommandEmpty>

        <CommandGroup heading="Commands">
          {COMMANDS.filter((c) => c.group === "General").map((cmd) => (
            <CommandItem
              key={cmd.name}
              onSelect={() => { onCommand(`/${cmd.name}`); onOpenChange(false); }}
              className="gap-2"
            >
              <cmd.icon className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">/{cmd.name}</span>
              <span className="text-muted-foreground text-xs ml-auto">{cmd.description}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Permission Modes">
          {COMMANDS.filter((c) => c.group === "Modes").map((cmd) => (
            <CommandItem
              key={cmd.name}
              onSelect={() => { onCommand(`/${cmd.name}`); onOpenChange(false); }}
              className="gap-2"
            >
              <cmd.icon className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">/{cmd.name}</span>
              {permissionMode === cmd.name && (
                <span className="text-[10px] bg-primary text-primary-foreground px-1 rounded">active</span>
              )}
              <span className="text-muted-foreground text-xs ml-auto">{cmd.description}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Cmd+K 全局快捷键 hook */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return { open, setOpen };
}
