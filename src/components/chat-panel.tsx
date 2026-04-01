/**
 * Chat Panel — shadcn 暗黑终端风格
 *
 * 核心修复:
 *   - parts 按原始顺序渲染 (text 和 tool 交错, 不再分离)
 *   - shadcn Card 包裹工具调用
 *   - 斜杠命令补全 Popover
 *   - 底部 StatusBar 用 shadcn Badge
 */
"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToolCallRenderer } from "./tool-renderers";
import { CodeBlock } from "./code-block";
import { FileMentionPopover } from "./file-mention";
import { getCommandNames } from "@/lib/engine/commands";
import {
  Terminal, Loader2, Square, ChevronRight, CornerDownLeft,
} from "lucide-react";

interface ChatPanelProps {
  messages: UIMessage[];
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onStop?: () => void;
  onOptionClick?: (answer: string) => void;
  permissionMode?: string;
  cwd?: string;
  statusInfo?: {
    model?: string;
    tokens?: number;
    cost?: string;
    turns?: number;
  };
}

// ── Markdown 渲染 ──

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <CodeBlock key={`code-${i}`} code={codeBuffer.join("\n")} language={codeLang || undefined} />
        );
        codeBuffer = [];
        codeLang = "";
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCodeBlock) { codeBuffer.push(line); continue; }

    if (line.startsWith("### ")) {
      elements.push(<h4 key={i} className="text-sm font-semibold text-foreground mt-3 mb-1">{line.slice(4)}</h4>);
    } else if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-sm font-bold text-foreground mt-3 mb-1">{line.slice(3)}</h3>);
    } else if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="text-base font-bold text-foreground mt-3 mb-1">{line.slice(2)}</h2>);
    } else if (line.match(/^[-*] /)) {
      elements.push(
        <div key={i} className="text-sm text-foreground/80 pl-3">
          <span className="text-muted-foreground mr-1">•</span>
          <InlineMarkdown text={line.slice(2)} />
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(<p key={i} className="text-sm text-foreground/80"><InlineMarkdown text={line} /></p>);
    }
  }
  return <div className="space-y-0.5">{elements}</div>;
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*|`[^`]+`|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`"))
          return <code key={i} className="bg-secondary text-green-400 px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
        if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**"))
          return <em key={i} className="text-muted-foreground">{part.slice(1, -1)}</em>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── 消息渲染: parts 按顺序交错 ──

function MessageBubble({
  message,
  onOptionClick,
}: {
  message: UIMessage;
  onOptionClick?: (answer: string) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    const text = message.parts.filter((p) => p.type === "text").map((p) => ("text" in p ? p.text : "")).join("\n");
    return (
      <div className="flex items-start gap-2 group">
        <ChevronRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
        <div className="text-sm text-foreground whitespace-pre-wrap">{text}</div>
      </div>
    );
  }

  // Assistant: 按 parts 原始顺序渲染 (修复 tool/text 分离问题)
  return (
    <div className="flex items-start gap-2">
      <CornerDownLeft className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        {message.parts.map((part, i) => (
          <PartRenderer key={i} part={part} onOptionClick={onOptionClick} />
        ))}
      </div>
    </div>
  );
}

/** 单个 part 渲染: text → Markdown, reasoning → 折叠块, tool → ToolCallRenderer */
function PartRenderer({ part, onOptionClick }: { part: UIMessage["parts"][number]; onOptionClick?: (answer: string) => void }) {
  if (part.type === "text" && "text" in part) {
    const text = part.text as string;
    if (!text.trim()) return null;
    return <SimpleMarkdown text={text} />;
  }

  // Extended thinking / reasoning (对标 CC ThinkingToggle)
  if (part.type === "reasoning" && "text" in part) {
    const text = (part as { text: string }).text;
    if (!text?.trim()) return null;
    return (
      <details className="text-xs">
        <summary className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none py-1">
          <span className="text-purple-400">💭 Thinking</span>
          <span className="text-muted-foreground/50 ml-2">({text.length} chars)</span>
        </summary>
        <div className="pl-4 border-l-2 border-purple-800 mt-1 text-muted-foreground text-[11px] whitespace-pre-wrap max-h-64 overflow-auto">
          {text}
        </div>
      </details>
    );
  }

  if (isToolUIPart(part)) {
    const isComplete = part.state === "output-available";
    const toolName = "toolName" in part ? String((part as Record<string, unknown>).toolName) : part.type;
    const input = "input" in part ? (part.input as Record<string, unknown>) : null;
    const output = isComplete && "output" in part ? part.output : null;

    return (
      <ToolCallRenderer
        toolName={toolName}
        input={input}
        output={output}
        isComplete={isComplete}
        onOptionClick={onOptionClick}
      />
    );
  }

  return null;
}

// ── 斜杠命令补全 Popover ──

function CommandAutocomplete({
  input,
  onSelect,
  visible,
}: {
  input: string;
  onSelect: (cmd: string) => void;
  visible: boolean;
}) {
  const commands = getCommandNames();
  const prefix = input.slice(1).toLowerCase();
  const filtered = commands.filter((c) => c.startsWith(prefix));

  if (!visible || filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 w-64 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50">
      {filtered.map((cmd) => (
        <button
          key={cmd}
          type="button"
          onClick={() => onSelect(`/${cmd}`)}
          className="w-full text-left px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent transition-colors font-mono"
        >
          /{cmd}
        </button>
      ))}
    </div>
  );
}

// ── Status Bar ──

function StatusBar({ info, isLoading, permissionMode }: {
  info?: ChatPanelProps["statusInfo"];
  isLoading: boolean;
  permissionMode?: string;
}) {
  return (
    <div className="h-7 px-3 border-t border-border bg-card flex items-center gap-3 text-[10px] text-muted-foreground font-mono shrink-0">
      {isLoading && (
        <Badge variant="outline" className="h-4 text-[9px] gap-1 text-yellow-400 border-yellow-800">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />streaming
        </Badge>
      )}
      {permissionMode && (
        <Badge variant="outline" className={`h-4 text-[9px] ${
          permissionMode === "plan" ? "text-yellow-400 border-yellow-800" :
          permissionMode === "auto" ? "text-green-400 border-green-800" :
          "text-muted-foreground"
        }`}>{permissionMode}</Badge>
      )}
      {info?.model && <span>model: <span className="text-foreground/60">{info.model}</span></span>}
      {info?.turns != null && <span>turns: <span className="text-foreground/60">{info.turns}</span></span>}
      <span className="ml-auto text-muted-foreground/50">
        <kbd className="text-[9px] bg-secondary px-1 rounded">⌘K</kbd> commands · Vercel AI SDK
      </span>
    </div>
  );
}

// ── 流式指示器 (带计时) ──

function StreamingIndicator() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm pl-5">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-400" />
      <span>thinking...</span>
      {elapsed > 0 && <span className="text-[10px] text-muted-foreground/40">{elapsed}s</span>}
    </div>
  );
}

// ── Main ──

export function ChatPanel({
  messages,
  input,
  isLoading,
  onInputChange,
  onSubmit,
  onKeyDown: parentKeyDown,
  onStop,
  onOptionClick,
  permissionMode,
  cwd,
  statusInfo,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showCommands, setShowCommands] = useState(false);
  const [showFileMention, setShowFileMention] = useState(false);
  const userScrolledUp = useRef(false);

  // 智能自动滚动: 只在用户没有手动上滚时跟随底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el && !userScrolledUp.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // 检测用户是否手动上滚
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      userScrolledUp.current = !atBottom;
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  // 新消息时重置滚动跟随
  useEffect(() => {
    if (!isLoading) userScrolledUp.current = false;
  }, [isLoading]);

  // Ctrl+C → stop streaming (对标 CC 的 Ctrl-C interrupt)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "c" && (e.ctrlKey || e.metaKey) && isLoading) {
        e.preventDefault();
        onStop?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isLoading, onStop]);

  // 斜杠命令 + @ 文件提及检测
  const handleInputChange = useCallback((value: string) => {
    onInputChange(value);
    setShowCommands(value.startsWith("/") && !value.includes(" "));
    // 检测 @ 触发: 最后一个字符是 @ 或者 @ 后面有非空格文字
    const atIdx = value.lastIndexOf("@");
    setShowFileMention(atIdx >= 0 && !value.slice(atIdx).includes(" "));
  }, [onInputChange]);

  const handleCommandSelect = useCallback((cmd: string) => {
    onInputChange(cmd);
    setShowCommands(false);
    inputRef.current?.focus();
  }, [onInputChange]);

  // 键盘: Esc 关闭补全, 其余委托给 parent (历史导航等)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setShowCommands(false); setShowFileMention(false); }
    // 不传 ↑↓ 给 parent 当 popover 开着时 (popover 自己处理)
    if ((showCommands || showFileMention) && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Tab")) return;
    parentKeyDown?.(e);
  }, [parentKeyDown, showCommands, showFileMention]);

  // @ 文件选中 → 替换 @query 为文件路径
  const handleFileSelect = useCallback((filePath: string) => {
    const atIdx = input.lastIndexOf("@");
    const before = atIdx >= 0 ? input.slice(0, atIdx) : input;
    onInputChange(`${before}@${filePath} `);
    setShowFileMention(false);
    inputRef.current?.focus();
  }, [input, onInputChange]);

  return (
    <div className="flex flex-col h-full bg-background font-mono">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-2 shrink-0">
        <Terminal className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold text-foreground">vercel-claude-code</span>
        <Badge variant="secondary" className="text-[9px] h-4">v0.2</Badge>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="px-4 py-3 space-y-4 max-w-4xl mx-auto">
          {messages.length === 0 && (
            <div className="text-muted-foreground text-sm mt-8 text-center space-y-3">
              <Terminal className="w-10 h-10 mx-auto text-muted-foreground/20" />
              <p className="text-foreground/70">What would you like to build?</p>
              <p className="text-xs text-muted-foreground/40">
                10 tools: bash · file_read · file_edit · file_write · glob · grep · web_fetch · web_search · agent · ask_user
              </p>
              <div className="flex flex-wrap justify-center gap-2 text-[10px] text-muted-foreground/40 mt-2">
                <span><kbd className="bg-secondary px-1 rounded">⌘K</kbd> commands</span>
                <span><kbd className="bg-secondary px-1 rounded">/</kbd> slash commands</span>
                <span><kbd className="bg-secondary px-1 rounded">@</kbd> file mention</span>
                <span><kbd className="bg-secondary px-1 rounded">↑↓</kbd> history</span>
                <span><kbd className="bg-secondary px-1 rounded">Ctrl+C</kbd> stop</span>
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} onOptionClick={onOptionClick} />
          ))}
          {isLoading && <StreamingIndicator />}
        </div>
      </div>

      <Separator />

      {/* Input */}
      <form onSubmit={onSubmit} className="px-4 py-2.5 shrink-0 relative max-w-4xl mx-auto w-full">
        <CommandAutocomplete input={input} onSelect={handleCommandSelect} visible={showCommands} />
        <FileMentionPopover
          input={input}
          visible={showFileMention && !showCommands}
          cwd={cwd ?? ""}
          onSelect={handleFileSelect}
          onClose={() => setShowFileMention(false)}
        />
        <div className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-primary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message or /command..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 caret-primary"
            disabled={isLoading}
            autoFocus
          />
          {isLoading && (
            <button
              type="button"
              onClick={onStop}
              className="p-1 text-destructive hover:bg-destructive/10 rounded"
              title="Stop (^C)"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </form>

      {/* Status Bar */}
      <StatusBar info={statusInfo} isLoading={isLoading} permissionMode={permissionMode} />
    </div>
  );
}
