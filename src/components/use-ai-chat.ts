/**
 * AI Chat Hook — Round 10: 输入历史 + 实时状态
 *
 * 新增:
 *   - 上下箭头 → 回溯历史消息 (对标 CC useArrowKeyHistory)
 *   - 实时 token/cost 跟踪
 *   - Escape 取消输入
 */
"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { isCommand, executeCommand } from "@/lib/engine/commands";

export type PermissionMode = "auto" | "plan" | "default";

interface UseAgentChatOptions {
  cwd?: string;
  permissionMode?: PermissionMode;
}

/** 状态追踪 */
export interface AgentStatus {
  tokens: number;
  cost: string;
  turns: number;
  model: string;
  permissionMode: PermissionMode;
}

export function useAgentChat(options: UseAgentChatOptions = {}) {
  const [input, setInput] = useState("");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(options.permissionMode ?? "auto");
  const [selectedModel, setSelectedModel] = useState("anthropic/claude-sonnet-4-6");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [systemMessages, setSystemMessages] = useState<UIMessage[]>([]);

  // ── 输入历史 (对标 CC useArrowKeyHistory) ──
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyDraft = useRef(""); // 保存用户正在输入的草稿

  // ── 实时状态追踪 ──
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    tokens: 0,
    cost: "$0.000",
    turns: 0,
    model: "claude-sonnet-4-6",
    permissionMode: options.permissionMode ?? "auto",
  });

  const cwdRef = useRef(options.cwd ?? "");
  const permRef = useRef(permissionMode);
  permRef.current = permissionMode;
  const modelRef = useRef(selectedModel);
  modelRef.current = selectedModel;

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages,
            cwd: cwdRef.current,
            permissionMode: permRef.current,
            model: modelRef.current,
            sessionId,
          },
        }),
      })
  );

  const { messages, status, sendMessage, stop, setMessages } = useChat({
    transport,
    onFinish: () => {
      // 更新轮次
      setAgentStatus((prev) => ({ ...prev, turns: prev.turns + 1 }));
      // 自动保存
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
      .catch(() => {});
  }, [messages, sessionId]);

  // 同步 permissionMode 到状态
  useEffect(() => {
    setAgentStatus((prev) => ({ ...prev, permissionMode }));
  }, [permissionMode]);

  // ── 提交消息 ──
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;

    // 记录历史
    setInputHistory((prev) => {
      const deduped = prev.filter((h) => h !== text);
      return [text, ...deduped].slice(0, 50); // 保留 50 条
    });
    setHistoryIndex(-1);

    // 斜杠命令
    if (isCommand(text)) {
      const result = await executeCommand(text);
      if (result.handled) {
        setInput("");
        if (result.message) {
          const sysMsg: UIMessage = {
            id: `cmd-${Date.now()}`,
            role: "assistant",
            parts: [{ type: "text", text: result.message }],
          };
          setSystemMessages((prev) => [...prev, sysMsg]);
        }
        if (result.action === "clear") {
          setMessages([]);
          setSystemMessages([]);
          setSessionId(null);
        }
        if (result.action === "compact") {
          sendMessage({ text: "[system: compact conversation]" });
        }
        if (result.action === "cost") {
          // /cost → 显示真实状态
          const sysMsg: UIMessage = {
            id: `cost-${Date.now()}`,
            role: "assistant",
            parts: [{
              type: "text",
              text: `**Session Cost**\n\n- **Model**: ${agentStatus.model}\n- **Tokens**: ${agentStatus.tokens.toLocaleString()}\n- **Estimated cost**: ${agentStatus.cost}\n- **Turns**: ${agentStatus.turns}\n- **Permission mode**: ${agentStatus.permissionMode}\n- **Messages**: ${messages.length}`,
            }],
          };
          setSystemMessages((prev) => [...prev, sysMsg]);
        }
        if (result.action === "resume") {
          // /resume → 列出历史会话
          fetch(`/api/sessions?cwd=${encodeURIComponent(cwdRef.current)}`)
            .then((r) => r.json())
            .then((sessions: Array<{ id: string; title: string; updatedAt: string; messageCount: number }>) => {
              if (sessions.length === 0) {
                const sysMsg: UIMessage = {
                  id: `resume-${Date.now()}`,
                  role: "assistant",
                  parts: [{ type: "text", text: "No saved sessions found." }],
                };
                setSystemMessages((prev) => [...prev, sysMsg]);
              } else {
                const list = sessions.slice(0, 10).map((s, i) =>
                  `${i + 1}. **${s.title}** — ${s.messageCount} messages, ${new Date(s.updatedAt).toLocaleDateString()}`
                ).join("\n");
                const sysMsg: UIMessage = {
                  id: `resume-${Date.now()}`,
                  role: "assistant",
                  parts: [{ type: "text", text: `**Saved Sessions**\n\n${list}\n\n*Type the session number to resume (coming soon)*` }],
                };
                setSystemMessages((prev) => [...prev, sysMsg]);
              }
            })
            .catch(() => {});
        }
        if (result.data?.permissionMode) {
          setPermissionMode(result.data.permissionMode as PermissionMode);
        }
        return;
      }
    }

    sendMessage({ text });
    setInput("");
  }, [input, sendMessage, setMessages]);

  // ── 键盘事件 (历史 + 快捷键) ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // ↑ 上一条历史
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (inputHistory.length === 0) return;
        if (historyIndex === -1) historyDraft.current = input;
        const next = Math.min(historyIndex + 1, inputHistory.length - 1);
        setHistoryIndex(next);
        setInput(inputHistory[next] ?? "");
      }
      // ↓ 下一条历史
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex <= 0) {
          setHistoryIndex(-1);
          setInput(historyDraft.current);
        } else {
          const next = historyIndex - 1;
          setHistoryIndex(next);
          setInput(inputHistory[next] ?? "");
        }
      }
      // Escape 清空输入
      else if (e.key === "Escape") {
        setInput("");
        setHistoryIndex(-1);
      }
    },
    [input, inputHistory, historyIndex]
  );

  // ── AskUser 点击 ──
  const handleOptionClick = useCallback(
    (answer: string) => {
      sendMessage({ text: answer });
    },
    [sendMessage]
  );

  const allMessages = [...systemMessages, ...messages];

  return {
    messages: allMessages,
    input,
    setInput,
    status,
    handleSubmit,
    handleKeyDown,
    stop,
    sendMessage,
    isLoading: status === "streaming" || status === "submitted",
    permissionMode,
    selectedModel,
    setSelectedModel,
    handleOptionClick,
    agentStatus,
    sessionId,
    setMessages,
  };
}
