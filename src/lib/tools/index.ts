/**
 * Tool Registry — 对标 Claude Code tools.ts
 *
 * Round 4: + AgentTool + WebFetchTool
 * 解决循环依赖: agent-tool 接收 subTools 参数而非 import assembleTools
 */
import { createBashTool } from "./bash-tool";
import { createFileReadTool, createFileEditTool, createFileWriteTool } from "./file-tools";
import { createGlobTool, createGrepTool } from "./search-tools";
import { createAgentTool } from "./agent-tool";
import { createWebFetchTool } from "./web-tool";
import { createAskUserTool } from "./ask-user-tool";
import type { ToolContext } from "./types";

export type { ToolContext, AppState } from "./types";
export { createInitialState } from "./types";

/**
 * 组装全量工具集 — 对标 assembleToolPool()
 *
 * 设计: 先组装 base tools, 再将 base tools 传给 agent tool
 * 这样子 agent 获得相同工具集 (不含 agent 自身, 防止无限嵌套)
 */
export function assembleTools(ctx: ToolContext) {
  const readOnlyTools = {
    file_read: createFileReadTool(ctx),
    glob: createGlobTool(ctx),
    grep: createGrepTool(ctx),
  };

  if (!ctx.allowWrite && !ctx.allowBash) {
    return readOnlyTools;
  }

  // Base tools (子 agent 也会拥有这些)
  const baseTools = {
    ...readOnlyTools,
    bash: createBashTool(ctx),
    file_edit: createFileEditTool(ctx),
    file_write: createFileWriteTool(ctx),
    web_fetch: createWebFetchTool(),
  };

  return {
    ...baseTools,
    agent: createAgentTool(ctx.cwd, baseTools),
    ask_user: createAskUserTool(),
  };
}
