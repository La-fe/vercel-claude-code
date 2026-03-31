/**
 * Tool 类型系统 — 对标 Claude Code Tool.ts
 *
 * Round 3: 集成权限检查
 */
import type { PermissionMode, PermissionRule } from "../engine/permissions";

/** 工具执行上下文 — 对标 ToolUseContext */
export interface ToolContext {
  /** 当前工作目录 */
  cwd: string;
  /** 中止控制器 */
  abortController: AbortController;
  /** 是否允许写操作 (从 permissionMode 派生) */
  allowWrite: boolean;
  /** 是否允许执行命令 (从 permissionMode 派生) */
  allowBash: boolean;
  /** 权限模式 */
  permissionMode: PermissionMode;
  /** 自定义权限规则 */
  permissionRules: PermissionRule[];
  /** 获取应用状态 */
  getState: () => AppState;
  /** 更新应用状态 */
  setState: (fn: (prev: AppState) => AppState) => void;
}

/** 应用状态 — 对标 AppState */
export interface AppState {
  cwd: string;
  permissionMode: PermissionMode;
  totalTokens: { input: number; output: number };
  turnCount: number;
  startedAt: number;
  /** 权限拒绝记录 — 对标 permissionDenials */
  permissionDenials: Array<{
    tool: string;
    reason: string;
    timestamp: number;
  }>;
}

/** 初始状态 */
export function createInitialState(cwd: string): AppState {
  return {
    cwd,
    permissionMode: "default",
    totalTokens: { input: 0, output: 0 },
    turnCount: 0,
    startedAt: Date.now(),
    permissionDenials: [],
  };
}
