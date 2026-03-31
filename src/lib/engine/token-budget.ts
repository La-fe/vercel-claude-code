/**
 * Token Budget — 对标 Claude Code query/tokenBudget.ts
 *
 * Claude Code 预算策略:
 *   - BudgetTracker 跟踪: continuationCount, lastDeltaTokens, startedAt
 *   - checkTokenBudget(): continue (注入 nudge) 或 stop
 *   - 阈值: 90% budget → stop; delta < 500 连续 3 次 → stop (收益递减)
 *   - USD 预算: getTotalCost() >= maxBudgetUsd → stop
 *
 * Vercel AI SDK 映射:
 *   - streamText result.usage → { promptTokens, completionTokens }
 *   - 无内置预算管理，需手动追踪
 */

export interface BudgetTracker {
  /** 连续继续次数 */
  continuationCount: number;
  /** 上一轮 delta tokens */
  lastDeltaTokens: number;
  /** 累计输入 tokens */
  totalInputTokens: number;
  /** 累计输出 tokens */
  totalOutputTokens: number;
  /** 会话开始时间 */
  startedAt: number;
}

export function createBudgetTracker(): BudgetTracker {
  return {
    continuationCount: 0,
    lastDeltaTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    startedAt: Date.now(),
  };
}

export interface BudgetConfig {
  /** 最大总 token 数 (input + output) */
  maxTotalTokens: number;
  /** 最大 USD 花费 */
  maxBudgetUsd?: number;
  /** 最大轮次 */
  maxTurns: number;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  maxTotalTokens: 1_000_000,  // 1M tokens per session
  maxBudgetUsd: 5.0,           // $5 max
  maxTurns: 100,
};

export type BudgetDecision =
  | { action: "continue"; message?: string }
  | { action: "stop"; reason: string };

// 价格表 ($/1M tokens)
const PRICING: Record<string, { input: number; output: number }> = {
  "sonnet": { input: 3, output: 15 },
  "haiku": { input: 0.25, output: 1.25 },
  "default": { input: 3, output: 15 },
};

/** 估算 USD 花费 */
export function estimateCost(tracker: BudgetTracker): number {
  const p = PRICING["default"]!;
  return (
    (tracker.totalInputTokens / 1_000_000) * p.input +
    (tracker.totalOutputTokens / 1_000_000) * p.output
  );
}

/** 更新 tracker 并返回决策 — 对标 checkTokenBudget() */
export function updateBudget(
  tracker: BudgetTracker,
  usage: { promptTokens: number; completionTokens: number },
  turnCount: number,
  config: BudgetConfig = DEFAULT_BUDGET
): BudgetDecision {
  // 更新累计
  const prevTotal = tracker.totalInputTokens + tracker.totalOutputTokens;
  tracker.totalInputTokens += usage.promptTokens;
  tracker.totalOutputTokens += usage.completionTokens;
  const newTotal = tracker.totalInputTokens + tracker.totalOutputTokens;

  // Delta tracking (对标 diminishing returns 检测)
  const delta = newTotal - prevTotal;
  tracker.lastDeltaTokens = delta;
  tracker.continuationCount++;

  // Check 1: Token 总量
  const utilization = newTotal / config.maxTotalTokens;
  if (utilization >= 0.9) {
    return {
      action: "stop",
      reason: `Token budget 90% exhausted (${newTotal.toLocaleString()} / ${config.maxTotalTokens.toLocaleString()})`,
    };
  }

  // Check 2: USD 预算
  if (config.maxBudgetUsd) {
    const cost = estimateCost(tracker);
    if (cost >= config.maxBudgetUsd) {
      return {
        action: "stop",
        reason: `USD budget exhausted ($${cost.toFixed(2)} / $${config.maxBudgetUsd})`,
      };
    }
  }

  // Check 3: 轮次
  if (turnCount >= config.maxTurns) {
    return {
      action: "stop",
      reason: `Max turns reached (${turnCount} / ${config.maxTurns})`,
    };
  }

  // Continue with status
  const pct = Math.round(utilization * 100);
  return {
    action: "continue",
    message: `[Budget: ${pct}% used, ~$${estimateCost(tracker).toFixed(3)}, turn ${turnCount}]`,
  };
}

/** 格式化 budget 状态为字符串 */
export function formatBudgetStatus(tracker: BudgetTracker, turnCount: number): string {
  const total = tracker.totalInputTokens + tracker.totalOutputTokens;
  const cost = estimateCost(tracker);
  const duration = Math.round((Date.now() - tracker.startedAt) / 1000);
  return `Tokens: ${total.toLocaleString()} | Cost: $${cost.toFixed(3)} | Turns: ${turnCount} | Time: ${duration}s`;
}
