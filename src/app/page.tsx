/**
 * Main Page — Claude Code Replica
 *
 * Round 7: 斜杠命令 + 交互式 AskUser + 会话持久
 */
"use client";

import { useAgentChat } from "@/components/use-ai-chat";
import { ChatPanel } from "@/components/chat-panel";

export default function Home() {
  const {
    messages,
    input,
    setInput,
    isLoading,
    handleSubmit,
    stop,
    permissionMode,
    handleOptionClick,
  } = useAgentChat({
    cwd: process.env.NEXT_PUBLIC_CWD || "",
    permissionMode: "auto",
  });

  return (
    <div className="h-screen">
      <ChatPanel
        messages={messages}
        input={input}
        isLoading={isLoading}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onStop={stop}
        onOptionClick={handleOptionClick}
        permissionMode={permissionMode}
        statusInfo={{
          model: "claude-sonnet-4-6",
          turns: messages.filter((m) => m.role === "user").length,
        }}
      />
    </div>
  );
}
