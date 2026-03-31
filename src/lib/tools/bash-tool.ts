/**
 * BashTool — Shell 命令执行
 *
 * 对标 Claude Code BashTool:
 *   - 执行 shell 命令
 *   - 超时控制
 *   - 输出截断
 *   - 安全检查 (危险命令拦截)
 */
import { tool } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import type { ToolContext } from "./types";

const MAX_OUTPUT_CHARS = 100_000;
const DEFAULT_TIMEOUT_MS = 120_000;

/** 永远阻止的命令 */
const BLOCKED_PATTERNS = [
  /:\(\)\s*\{\s*:\|:\s*&\s*\}/,  // fork bomb
  /mkfs\./,
  /dd\s+if=/,
  />\s*\/dev\/sd/,
];

/** default 模式下需要确认的命令 (CC 的 classifier 对标) */
const NEEDS_CONFIRM_PATTERNS = [
  /rm\s+-rf/,
  /git\s+push/,
  /git\s+reset\s+--hard/,
  /git\s+checkout\s+--/,
  /git\s+clean\s+-f/,
  /npm\s+publish/,
  /DROP\s+TABLE/i,
  /DELETE\s+FROM/i,
  /curl\s.*\|\s*(bash|sh)/,
];

function isBlocked(command: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) return `Permanently blocked: ${pattern}`;
  }
  return null;
}

function needsConfirmation(command: string): boolean {
  return NEEDS_CONFIRM_PATTERNS.some((p) => p.test(command));
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  const half = Math.floor(MAX_OUTPUT_CHARS / 2);
  return (
    output.slice(0, half) +
    `\n\n... [truncated ${output.length - MAX_OUTPUT_CHARS} chars] ...\n\n` +
    output.slice(-half)
  );
}

export function createBashTool(ctx: ToolContext) {
  return tool({
    description:
      "Execute a shell command and return its output. " +
      "Use for running scripts, git commands, builds, tests, etc. " +
      "Commands run in the project's working directory.",
    inputSchema: z.object({
      command: z.string().describe("The shell command to execute"),
      timeout: z
        .number()
        .int()
        .max(600_000)
        .optional()
        .describe("Timeout in ms (max 600000, default 120000)"),
    }),
    execute: async ({ command, timeout }) => {
      // 永远阻止的命令
      const blocked = isBlocked(command);
      if (blocked) return { error: blocked };

      if (!ctx.allowBash) {
        return { error: "Bash execution is not allowed in current permission mode" };
      }

      // default 模式: 危险命令返回确认请求 (对标 CC PermissionDialog)
      if (ctx.permissionMode === "default" && needsConfirmation(command)) {
        return {
          operation: "needs_permission" as const,
          tool: "bash",
          command,
          reason: "This command may be destructive. Please confirm.",
          summary: `⚠️ Permission needed: \`${command.slice(0, 60)}\``,
        };
      }

      const timeoutMs = timeout ?? DEFAULT_TIMEOUT_MS;

      return new Promise<{ stdout: string; stderr: string; exitCode: number } | { error: string }>((resolve) => {
        const child = exec(command, {
          cwd: ctx.cwd,
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          signal: ctx.abortController.signal,
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (data) => { stdout += data; });
        child.stderr?.on("data", (data) => { stderr += data; });

        child.on("close", (code) => {
          resolve({
            stdout: truncateOutput(stdout),
            stderr: truncateOutput(stderr),
            exitCode: code ?? 0,
          });
        });

        child.on("error", (err) => {
          resolve({ error: err.message });
        });
      });
    },
  });
}
