/**
 * AI Chat Hook — Round 7: 斜杠命令 + 交互式 AskUser + 会话保存
 *
 * 新增:
 *   - /help, /compact, /clear, /cost, /plan, /auto 斜杠命令
 *   - AskUser 选项点击 → 自动发送答案
 *   - 每次回复后自动保存会话
 */
"use client";

import { useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { isCommand, executeCommand } from "@/lib/engine/commands";

export type PermissionMode = "auto" | "plan" | "default";

interface UseAgentChatOptions {
  cwd?: string;
  permissionMode?: PermissionMode;
  /** 初始消息 (从 session resume) */
  initialMessages?: UIMessage[];
}

export function useAgentChat(options: UseAgentChatOptions = {}) {
  const [input, setInput] = useState("");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(options.permissionMode ?? "auto");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [systemMessages, setSystemMessages] = useState<UIMessage[]>([]);

  const cwdRef = useRef(options.cwd ?? "");
  const permRef = useRef(permissionMode);
  permRef.current = permissionMode;

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages,
            cwd: cwdRef.current,
            permissionMode: permRef.current,
            sessionId,
          },
        }),
      })
  );

  const { messages, status, sendMessage, stop, setMessages } = useChat({
    transport,
    onFinish: () => {
      // 自动保存会话 (对标 CC 的 history 持久化)
      autoSave();
    },
    onError: (error) => {
      console.error("[agent] Stream error:", error);
    },
  });

  // ── 自动保存 ──
  const autoSave = useCallback(() => {
    if (messages.length < 2) return;
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        cwd: cwdRef.current,
        sessionId,
        messages,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.id && !sessionId) setSessionId(data.id);
      })
      .catch(() => {}); // 静默失败
  }, [messages, sessionId]);

  // ── 斜杠命令处理 ──
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;

    // 检查斜杠命令
    if (isCommand(text)) {
      const result = await executeCommand(text);

      if (result.handled) {
        setInput("");

        // 注入系统消息 (不是 LLM 消息, 是本地 UI 消息)
        if (result.message) {
          const sysMsg: UIMessage = {
            id: `cmd-${Date.now()}`,
            role: "assistant",
            parts: [{ type: "text", text: result.message }],
          };
          setSystemMessages((prev) => [...prev, sysMsg]);
        }

        // 处理特殊动作
        if (result.action === "clear") {
          setMessages([]);
          setSystemMessages([]);
          setSessionId(null);
        }
        if (result.action === "compact") {
          // 触发服务端压缩 → 发送特殊消息
          sendMessage({ text: "[system: compact conversation]" });
        }

        // 处理模式切换
        if (result.data?.permissionMode) {
          setPermissionMode(result.data.permissionMode as PermissionMode);
        }

        return;
      }
    }

    // 正常消息 → 发给 LLM
    sendMessage({ text });
    setInput("");
  }, [input, sendMessage, setMessages]);

  // ── AskUser 选项点击 → 自动回复 (对标 CC 的 onAllow) ──
  const handleOptionClick = useCallback((answer: string) => {
    sendMessage({ text: answer });
  }, [sendMessage]);

  // ── 合并系统消息和 LLM 消息 ──
  const allMessages = [...systemMessages, ...messages];

  return {
    messages: allMessages,
    input,
    setInput,
    status,
    handleSubmit,
    stop,
    sendMessage,
    isLoading: status === "streaming" || status === "submitted",
    permissionMode,
    handleOptionClick,
    sessionId,
    setMessages,
    setSessionId,
  };
}
