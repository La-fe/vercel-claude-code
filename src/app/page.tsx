/**
 * Main Page — vercel-claude-code
 */
"use client";

import { useAgentChat } from "@/components/use-ai-chat";
import { ChatPanel } from "@/components/chat-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";

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

  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();

  // 命令面板选中 → 注入输入并提交
  const handlePaletteCommand = (cmd: string) => {
    setInput(cmd);
    // 用 setTimeout 让 input 更新后再提交
    setTimeout(() => {
      const form = document.querySelector("form");
      form?.requestSubmit();
    }, 50);
  };

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
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onCommand={handlePaletteCommand}
          permissionMode={permissionMode}
        />
      </div>
    </ErrorBoundary>
  );
}
