/**
 * 斜杠命令系统 — 对标 Claude Code commands.ts
 *
 * Round 11: 让 /cost 和 /resume 真正工作
 */

export interface CommandResult {
  handled: boolean;
  message?: string;
  action?: "compact" | "clear" | "resume" | "cost";
  data?: Record<string, unknown>;
}

export type CommandHandler = (args: string) => CommandResult | Promise<CommandResult>;

const commands: Record<string, { description: string; handler: CommandHandler }> = {};

function register(name: string, description: string, handler: CommandHandler) {
  commands[name] = { description, handler };
}

// ── 内置命令 ──

register("help", "Show available commands", () => ({
  handled: true,
  message: `**Available commands:**

- **/help** — Show this help
- **/compact** — Compress conversation history
- **/clear** — Clear conversation
- **/cost** — Show token usage and cost
- **/plan** — Read-only mode (safe exploration)
- **/auto** — Full mode (all tools, no confirmation)
- **/default** — Default mode (confirm dangerous ops)
- **/resume** — Resume a previous session

**Keyboard shortcuts:**
- **↑/↓** — Input history
- **Ctrl+C** — Stop streaming
- **Escape** — Clear input
- **/** — Command autocomplete`,
}));

register("compact", "Compress conversation history", () => ({
  handled: true,
  action: "compact",
  message: "⏳ Compacting conversation...",
}));

register("clear", "Clear conversation", () => ({
  handled: true,
  action: "clear",
  message: "Conversation cleared.",
}));

register("cost", "Show token usage and cost", () => ({
  handled: true,
  action: "cost",
  // message 由调用方根据 agentStatus 填入
}));

register("resume", "Resume a previous session", () => ({
  handled: true,
  action: "resume",
}));

register("plan", "Enter plan mode (read-only tools)", () => ({
  handled: true,
  message: "Switched to **plan mode** — only read-only tools (file_read, glob, grep).\nUse `/auto` to return to full mode.",
  data: { permissionMode: "plan" },
}));

register("auto", "Enter auto mode (all tools, no confirmation)", () => ({
  handled: true,
  message: "Switched to **auto mode** — all tools available, no confirmation needed.",
  data: { permissionMode: "auto" },
}));

register("default", "Enter default mode (confirm dangerous ops)", () => ({
  handled: true,
  message: "Switched to **default mode** — dangerous operations require confirmation.",
  data: { permissionMode: "default" },
}));

register("mcp", "Connect to an MCP server (usage: /mcp <url>)", (args) => {
  if (!args) {
    return {
      handled: true,
      message: "Usage: `/mcp <sse-url>` — Connect to an MCP server\nExample: `/mcp http://localhost:3001/sse`",
    };
  }
  return {
    handled: true,
    action: "mcp" as "compact", // reuse action type
    data: { mcpUrl: args },
    message: `Connecting to MCP server: \`${args}\`...`,
  };
});

// ── 路由 ──

export function isCommand(input: string): boolean {
  return input.trim().startsWith("/");
}

export async function executeCommand(input: string): Promise<CommandResult> {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return { handled: false };

  const spaceIdx = trimmed.indexOf(" ", 1);
  const name = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);

  const cmd = commands[name];
  if (!cmd) {
    return {
      handled: true,
      message: `Unknown command: \`/${name}\`\nType \`/help\` for available commands.`,
    };
  }

  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
  return cmd.handler(args);
}

export function getCommandNames(): string[] {
  return Object.keys(commands);
}
