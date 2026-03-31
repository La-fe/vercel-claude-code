/**
 * Chat Panel — 对标 Claude Code 终端 UI
 *
 * 重构要点 (对标 CC):
 *   1. 按工具类型定制渲染 (bash/file/grep 各有专属 UI)
 *   2. 3 态视觉: pending(黄) → complete(绿) → error(红)
 *   3. 底部状态栏: 模型 + token + 花费
 *   4. Markdown 渲染 (代码块、列表、加粗)
 *   5. 消息缩进 (对标 CC 的 ⎿ gutter)
 */
"use client";

import { useRef, useEffect } from "react";
import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import { ToolCallRenderer } from "./tool-renderers";

interface ChatPanelProps {
  messages: UIMessage[];
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop?: () => void;
  /** AskUser 选项点击回调 */
  onOptionClick?: (answer: string) => void;
  /** 权限模式 */
  permissionMode?: string;
  /** 状态栏信息 */
  statusInfo?: {
    model?: string;
    tokens?: number;
    cost?: string;
    turns?: number;
  };
}

// ── 简化 Markdown 渲染 (对标 CC 的 Markdown 组件) ──

function SimpleMarkdown({ text }: { text: string }) {
  // 将 markdown 转为基础 HTML 元素
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // 代码块
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="bg-gray-900 border border-gray-800 rounded px-3 py-2 my-2 overflow-auto text-[11px] font-mono text-gray-300">
            {codeLang && <div className="text-[10px] text-gray-600 mb-1">{codeLang}</div>}
            {codeBuffer.join("\n")}
          </pre>
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

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      elements.push(<h4 key={i} className="text-sm font-bold text-gray-100 mt-3 mb-1">{line.slice(4)}</h4>);
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-sm font-bold text-gray-100 mt-3 mb-1">{line.slice(3)}</h3>);
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="text-base font-bold text-gray-100 mt-3 mb-1">{line.slice(2)}</h2>);
      continue;
    }

    // 列表
    if (line.match(/^[-*] /)) {
      elements.push(
        <div key={i} className="text-sm text-gray-300 pl-3">
          <span className="text-gray-600 mr-1">•</span>
          <InlineMarkdown text={line.slice(2)} />
        </div>
      );
      continue;
    }

    // 空行
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // 普通段落
    elements.push(
      <p key={i} className="text-sm text-gray-300">
        <InlineMarkdown text={line} />
      </p>
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
}

/** 行内 markdown: **bold**, `code`, *italic* */
function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*|`[^`]+`|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-gray-100 font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i} className="bg-gray-800 text-green-300 px-1 py-0.5 rounded text-[12px] font-mono">{part.slice(1, -1)}</code>;
        }
        if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
          return <em key={i} className="text-gray-400">{part.slice(1, -1)}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── 工具调用展示 ──

function ToolCallsDisplay({ message, onOptionClick }: { message: UIMessage; onOptionClick?: (answer: string) => void }) {
  const toolParts = message.parts.filter(isToolUIPart);
  if (toolParts.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {toolParts.map((part, i) => {
        const isComplete = part.state === "output-available";
        const toolName = "toolName" in part ? String((part as Record<string, unknown>).toolName) : part.type;
        const input = "input" in part ? (part.input as Record<string, unknown>) : null;
        const output = isComplete && "output" in part ? part.output : null;

        return (
          <ToolCallRenderer
            key={i}
            toolName={toolName}
            input={input}
            output={output}
            isComplete={isComplete}
            onOptionClick={onOptionClick}
          />
        );
      })}
    </div>
  );
}

// ── 消息气泡 (对标 CC 的 ⎿ gutter 缩进) ──

function MessageBubble({ message, onOptionClick }: { message: UIMessage; onOptionClick?: (answer: string) => void }) {
  const isUser = message.role === "user";
  const textParts = message.parts.filter((p) => p.type === "text");
  const text = textParts.map((p) => ("text" in p ? p.text : "")).join("\n");

  if (isUser) {
    return (
      <div className="flex items-start gap-2">
        <span className="text-blue-400 text-xs font-mono mt-0.5 shrink-0 select-none">❯</span>
        <div className="text-sm text-white whitespace-pre-wrap">{text}</div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-600 text-xs font-mono mt-0.5 shrink-0 select-none">⎿</span>
      <div className="flex-1 min-w-0">
        {text && <SimpleMarkdown text={text} />}
        <ToolCallsDisplay message={message} onOptionClick={onOptionClick} />
      </div>
    </div>
  );
}

// ── 状态栏 (对标 CC StatusLine) ──

function StatusBar({ info, isLoading }: { info?: ChatPanelProps["statusInfo"]; isLoading: boolean }) {
  return (
    <div className="h-6 px-3 border-t border-gray-800 bg-gray-900 flex items-center gap-4 text-[10px] text-gray-500 font-mono shrink-0">
      {isLoading && <span className="text-yellow-400">● streaming</span>}
      {info?.model && <span>model: <span className="text-gray-400">{info.model}</span></span>}
      {info?.tokens != null && <span>tokens: <span className="text-gray-400">{info.tokens.toLocaleString()}</span></span>}
      {info?.cost && <span>cost: <span className="text-gray-400">{info.cost}</span></span>}
      {info?.turns != null && <span>turns: <span className="text-gray-400">{info.turns}</span></span>}
      <span className="ml-auto text-gray-600">Vercel AI SDK</span>
    </div>
  );
}

// ── 主组件 ──

export function ChatPanel({
  messages,
  input,
  isLoading,
  onInputChange,
  onSubmit,
  onStop,
  onOptionClick,
  permissionMode,
  statusInfo,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100 font-mono">
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2 shrink-0">
        <span className="text-green-400 text-sm font-bold">claude-code-replica</span>
        {permissionMode && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            permissionMode === "plan" ? "bg-yellow-900 text-yellow-300" :
            permissionMode === "auto" ? "bg-green-900 text-green-300" :
            "bg-gray-800 text-gray-400"
          }`}>{permissionMode}</span>
        )}
        <span className="text-gray-600 text-xs">v0.1</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="text-gray-600 text-sm mt-4 space-y-2">
            <p>Welcome to Claude Code Replica.</p>
            <p className="text-xs text-gray-700">
              Tools: bash, file_read, file_edit, file_write, glob, grep, web_fetch, agent
            </p>
            <p className="text-xs text-gray-700">
              Try: &quot;Read package.json and explain the project&quot;
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onOptionClick={onOptionClick} />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-yellow-400 text-sm">
            <span className="animate-spin text-xs">◐</span>
            <span>thinking...</span>
          </div>
        )}
      </div>

      {/* Input (对标 CC 的 > prompt) */}
      <form onSubmit={onSubmit} className="px-3 py-2 border-t border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-green-400 shrink-0">❯</span>
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Ask me to code something..."
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-700 caret-green-400"
            disabled={isLoading}
            autoFocus
          />
          {isLoading && (
            <button
              type="button"
              onClick={onStop}
              className="px-2 py-0.5 text-red-400 text-[10px] border border-red-800 rounded hover:bg-red-900 shrink-0"
            >
              ^C
            </button>
          )}
        </div>
      </form>

      {/* Status Bar (对标 CC StatusLine) */}
      <StatusBar info={statusInfo} isLoading={isLoading} />
    </div>
  );
}
