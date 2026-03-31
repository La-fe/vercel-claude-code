/**
 * Main Page — vercel-claude-code
 */
"use client";

import { useAgentChat } from "@/components/use-ai-chat";
import { ChatPanel } from "@/components/chat-panel";
import { ErrorBoundary } from "@/components/error-boundary";

export default function Home() {
  const {
    messages,
    input,
    setInput,
    isLoading,
    handleSubmit,
    handleKeyDown,
    stop,
    permissionMode,
    handleOptionClick,
    agentStatus,
  } = useAgentChat({
    cwd: process.env.NEXT_PUBLIC_CWD || "",
    permissionMode: "auto",
  });

  return (
    <ErrorBoundary>
    <div className="h-screen">
      <ChatPanel
        messages={messages}
        input={input}
        isLoading={isLoading}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        onStop={stop}
        onOptionClick={handleOptionClick}
        permissionMode={permissionMode}
        cwd={process.env.NEXT_PUBLIC_CWD || ""}
        statusInfo={{
          model: agentStatus.model,
          tokens: agentStatus.tokens,
          cost: agentStatus.cost,
          turns: agentStatus.turns,
        }}
      />
    </div>
    </ErrorBoundary>
  );
}
