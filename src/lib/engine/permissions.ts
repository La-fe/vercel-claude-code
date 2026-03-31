/**
 * Permission System — 对标 Claude Code hooks/toolPermission/
 *
 * Claude Code 权限架构:
 *   - 3 层 handler: coordinator → interactive → swarmWorker
 *   - 每层: hooks (fast) → classifier (inference) → user dialog
 *   - PermissionMode: default | auto | plan | bypass
 *   - 工具自声明 checkPermissions()
 *   - resolveOnce 防止重复决策
 *
 * 简化版实现:
 *   - 3 种模式: auto (全部允许) | plan (只读) | default (危险操作需确认)
 *   - 规则表: 按工具名 + 输入内容判断
 *   - 无交互确认 (Web UI 暂不支持)，用 allowlist 代替
 */

export type PermissionMode = "auto" | "plan" | "default";

export interface PermissionRule {
  /** 工具名匹配 (支持 * 通配) */
  tool: string;
  /** 是否允许 */
  allow: boolean;
  /** 原因 */
  reason?: string;
}

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
}

/** 只读工具 — plan 模式允许 */
const READ_ONLY_TOOLS = new Set(["file_read", "glob", "grep"]);

/** 危险命令模式 — default 模式拦截 */
const DANGEROUS_BASH_PATTERNS = [
  /rm\s+-rf/,
  /git\s+push\s+--force/,
  /git\s+reset\s+--hard/,
  /DROP\s+TABLE/i,
  /DELETE\s+FROM/i,
];

/**
 * 检查工具权限 — 对标 canUseTool()
 *
 * Claude Code 完整流程:
 *   1. validateInput() — 输入合法性
 *   2. checkPermissions() — 工具自检
 *   3. handler chain — coordinator/interactive/swarm
 *
 * 我们简化为: mode + rules 表
 */
export function checkPermission(
  toolName: string,
  input: Record<string, unknown>,
  mode: PermissionMode,
  customRules: PermissionRule[] = []
): PermissionDecision {
  // Auto mode: 全部允许 (对标 bypassPermissions)
  if (mode === "auto") {
    return { allowed: true, reason: "auto mode" };
  }

  // Plan mode: 只允许只读工具 (对标 plan mode)
  if (mode === "plan") {
    if (READ_ONLY_TOOLS.has(toolName)) {
      return { allowed: true, reason: "read-only tool in plan mode" };
    }
    return { allowed: false, reason: `Tool "${toolName}" not allowed in plan mode (read-only)` };
  }

  // Default mode: 检查自定义规则 + 危险命令拦截
  // 1. 自定义规则优先
  for (const rule of customRules) {
    const pattern = rule.tool.replace("*", ".*");
    if (new RegExp(`^${pattern}$`).test(toolName)) {
      return {
        allowed: rule.allow,
        reason: rule.reason ?? `Custom rule: ${rule.tool}`,
      };
    }
  }

  // 2. Bash 危险命令检查
  if (toolName === "bash" && typeof input.command === "string") {
    for (const pattern of DANGEROUS_BASH_PATTERNS) {
      if (pattern.test(input.command)) {
        return {
          allowed: false,
          reason: `Blocked dangerous command: ${input.command.slice(0, 50)}...`,
        };
      }
    }
  }

  // 3. 默认允许
  return { allowed: true, reason: "default allow" };
}

/** 创建权限检查中间件 — 包装 tool execute */
export function createPermissionChecker(mode: PermissionMode, rules?: PermissionRule[]) {
  return (toolName: string, input: Record<string, unknown>): PermissionDecision => {
    return checkPermission(toolName, input, mode, rules);
  };
}
