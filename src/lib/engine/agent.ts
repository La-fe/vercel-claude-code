/**
 * Agent Engine — 对标 Claude Code QueryEngine + queryLoop
 *
 * Round 2 新增:
 *   - Auto Compact: 消息过长时自动压缩
 *   - Token Budget: 跟踪用量，超预算停止
 *   - Reactive Compact: prompt-too-long 错误恢复
 *
 * Claude Code 完整流程:
 *   QueryEngine.submitMessage(prompt)
 *     → fetchSystemPromptParts()
 *     → auto compact (if needed)
 *     → queryLoop() {
 *         callModel() → tool_use → execute → tool_result → loop
 *         catch prompt_too_long → reactive compact → retry
 *         check token budget → continue or stop
 *       }
 *
 * Vercel AI SDK 映射:
 *   queryLoop = streamText({ tools, stopWhen })
 *   auto compact = 调用前检查 + generateText 压缩
 *   reactive compact = catch error → compact → retry streamText
 *   token budget = onFinish 回调 + usage tracking
 */
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { UIMessage } from "ai";
import { getModelInstance, MODELS } from "../llm";
import { buildSystemPrompt } from "./context";
import { assembleTools } from "../tools";
import type { ToolContext } from "../tools";
import { createInitialState } from "../tools/types";
import { needsCompaction, compactMessages } from "./compact";
import { extractMemories, saveExtractedMemories } from "./memory-extract";
import {
  createBudgetTracker,
  updateBudget,
  formatBudgetStatus,
  type BudgetTracker,
  type BudgetConfig,
  DEFAULT_BUDGET,
} from "./token-budget";

export interface AgentConfig {
  cwd: string;
  maxSteps?: number;
  permissionMode?: "default" | "auto" | "plan";
  model?: string;
  /** Token 预算配置 */
  budget?: Partial<BudgetConfig>;
  /** Extended thinking 预算 (对标 CC thinkingConfig) */
  thinkingBudget?: number;
}

export interface HandleMessageParams {
  messages: UIMessage[];
  config: AgentConfig;
  /** 跨请求持久化的 budget tracker (由调用方管理) */
  budgetTracker?: BudgetTracker;
}

export interface HandleMessageResult {
  /** streamText 的 result (untyped to avoid tool set mismatch) */
  stream: { toUIMessageStreamResponse: () => Response };
  /** 更新后的 budget tracker */
  budgetTracker: BudgetTracker;
  /** 消息是否被压缩过 */
  wasCompacted: boolean;
  /** budget 状态 (调试用) */
  budgetStatus?: string;
}

export async function handleMessage({
  messages,
  config,
  budgetTracker,
}: HandleMessageParams): Promise<HandleMessageResult> {
  const { cwd, maxSteps = 25, permissionMode = "default", model } = config;
  const budget: BudgetConfig = { ...DEFAULT_BUDGET, ...config.budget };
  const tracker = budgetTracker ?? createBudgetTracker();

  let appState = createInitialState(cwd);
  let wasCompacted = false;

  // Tool context (对标 ToolUseContext)
  const toolCtx: ToolContext = {
    cwd,
    abortController: new AbortController(),
    allowWrite: permissionMode !== "plan",
    allowBash: permissionMode !== "plan",
    permissionMode,
    permissionRules: [],
    getState: () => appState,
    setState: (fn) => { appState = fn(appState); },
  };

  // ── Phase 0: Auto Compact (对标 autoCompact) ──
  // Claude Code: 在 queryLoop 开始前检查消息长度，超过阈值则压缩
  let processedMessages = messages;
  if (needsCompaction(messages)) {
    console.log("[agent] Auto-compacting messages...");
    processedMessages = await compactMessages(messages);
    wasCompacted = true;
  }

  // ── Phase 1: System prompt (含记忆召回) ──
  // 提取用户最新消息用于记忆召回 (对标 findRelevantMemories)
  const userMessage = [...processedMessages]
    .reverse()
    .find((m) => m.role === "user")
    ?.parts.filter((p) => p.type === "text")
    .map((p) => ("text" in p ? p.text : ""))
    .join(" ") ?? "";

  const systemMessages = await buildSystemPrompt(cwd, userMessage);

  // ── Phase 2: Tools ──
  const tools = assembleTools(toolCtx);

  // ── Phase 3: Convert messages ──
  const modelMessages = await convertToModelMessages(processedMessages);

  // ── Phase 4: Budget pre-check ──
  const preCheck = updateBudget(
    tracker,
    { promptTokens: 0, completionTokens: 0 },
    appState.turnCount,
    budget
  );
  if (preCheck.action === "stop") {
    // 预算已耗尽，返回通知消息而非调 LLM
    const stopStream = streamText({
      model: getModelInstance(MODELS.FAST),
      system: "You are a helpful assistant.",
      prompt: `Inform the user: ${preCheck.reason}. Suggest they start a new session.`,
    });
    return { stream: stopStream, budgetTracker: tracker, wasCompacted, budgetStatus: preCheck.reason };
  }

  // ── Phase 5: Stream (对标 queryLoop) ──
  const stream = streamText({
    model: getModelInstance(model ?? MODELS.AGENT),
    system: systemMessages as Parameters<typeof streamText>[0]["system"],
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(maxSteps),
    // Extended thinking (对标 CC thinkingConfig)
    ...(config.thinkingBudget && {
      providerOptions: {
        anthropic: {
          thinking: { type: "enabled", budgetTokens: config.thinkingBudget },
        },
      },
    }),
    onFinish: ({ usage }) => {
      // 对标 Claude Code: queryLoop 结束后更新 budget
      if (usage) {
        const u = usage as unknown as Record<string, number>;
        const decision = updateBudget(
          tracker,
          {
            promptTokens: u.promptTokens ?? u.inputTokens ?? 0,
            completionTokens: u.completionTokens ?? u.outputTokens ?? 0,
          },
          appState.turnCount + 1,
          budget
        );
        if (decision.action === "stop") {
          console.log(`[agent] Budget stop: ${decision.reason}`);
        }
      }
      appState.turnCount++;

      // ── Post-query: 自动记忆提取 (对标 handleStopHooks → extractMemories) ──
      // 在后台异步运行, 不阻塞响应
      extractMemories(processedMessages, cwd)
        .then((memories) => {
          if (memories.length > 0) {
            return saveExtractedMemories(memories, cwd).then((n) => {
              if (n > 0) console.log(`[agent] Extracted ${n} memories`);
            });
          }
        })
        .catch((err) => console.error("[agent] Memory extraction failed:", err));
    },
  });

  return {
    stream,
    budgetTracker: tracker,
    wasCompacted,
    budgetStatus: formatBudgetStatus(tracker, appState.turnCount),
  };
}

// Re-exports
export { createBudgetTracker, formatBudgetStatus } from "./token-budget";
export type { BudgetTracker } from "./token-budget";
