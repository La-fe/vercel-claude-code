/**
 * 斜杠命令系统 — 对标 Claude Code commands.ts
 *
 * Claude Code 命令架构:
 *   - COMMANDS[] 数组, 每个含 name + type + load()
 *   - type: 'local' (纯本地) | 'local-jsx' (带 UI) | 'prompt' (注入 LLM)
 *   - 路由: /name → 匹配 → load() → 执行
 *
 * 简化版:
 *   - commands map, 同步执行
 *   - 返回 { handled, message?, action? }
 */

export interface CommandResult {
  /** 是否被命令处理了 (false = 交给 LLM) */
  handled: boolean;
  /** 显示给用户的消息 */
  message?: string;
  /** 特殊动作 */
  action?: "compact" | "clear" | "resume";
  /** 额外数据 */
  data?: Record<string, unknown>;
}

export type CommandHandler = (args: string) => CommandResult | Promise<CommandResult>;

/** 所有注册的命令 */
const commands: Record<string, { description: string; handler: CommandHandler }> = {};

/** 注册命令 */
function register(name: string, description: string, handler: CommandHandler) {
  commands[name] = { description, handler };
}

// ── 内置命令 ──

register("help", "Show available commands", () => {
  const lines = Object.entries(commands)
    .map(([name, cmd]) => `  /${name} — ${cmd.description}`)
    .join("\n");
  return {
    handled: true,
    message: `**Available commands:**\n\n${lines}\n\nType any other message to chat with the AI agent.`,
  };
});

register("compact", "Compress conversation history", () => {
  return {
    handled: true,
    action: "compact",
    message: "Compacting conversation history...",
  };
});

register("clear", "Clear conversation", () => {
  return {
    handled: true,
    action: "clear",
    message: "Conversation cleared.",
  };
});

register("cost", "Show token usage and cost", () => {
  // 数据由调用方填入
  return {
    handled: true,
    message: "Loading cost info...",
    data: { requestCost: true },
  };
});

register("resume", "Resume a previous session", () => {
  return {
    handled: true,
    action: "resume",
    message: "Loading sessions...",
  };
});

register("plan", "Enter plan mode (read-only tools)", () => {
  return {
    handled: true,
    message: "Switched to **plan mode** — only read-only tools available.\nUse `/auto` to return to full mode.",
    data: { permissionMode: "plan" },
  };
});

register("auto", "Enter auto mode (all tools, no confirmation)", () => {
  return {
    handled: true,
    message: "Switched to **auto mode** — all tools available.",
    data: { permissionMode: "auto" },
  };
});

// ── 命令路由 ──

export function isCommand(input: string): boolean {
  return input.trim().startsWith("/");
}

export async function executeCommand(input: string): Promise<CommandResult> {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return { handled: false };
  }

  const spaceIdx = trimmed.indexOf(" ", 1);
  const name = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

  const cmd = commands[name];
  if (!cmd) {
    return {
      handled: true,
      message: `Unknown command: /${name}\nType /help for available commands.`,
    };
  }

  return cmd.handler(args);
}

/** 获取所有命令名 (用于自动补全) */
export function getCommandNames(): string[] {
  return Object.keys(commands);
}
