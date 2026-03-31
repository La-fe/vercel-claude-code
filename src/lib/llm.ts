/**
 * LLM 封装 — Claude Code 复刻版
 *
 * 对标 Claude Code 的模型调用层:
 *   - 懒初始化 Provider
 *   - 模型路由
 *   - Prompt Caching
 *   - 结构化生成 + Retry
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import type { ModelMessage } from "ai";
import { z } from "zod";

// ── Provider 懒初始化 ──

let _anthropic: ReturnType<typeof createAnthropic> | null = null;
let _openrouter: ReturnType<typeof createOpenRouter> | null = null;

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is required");
  return key;
}

function getAnthropic() {
  if (!_anthropic) {
    _anthropic = createAnthropic({
      baseURL: "https://openrouter.ai/api/v1",
      authToken: getApiKey(),
    });
  }
  return _anthropic;
}

function getOpenRouter() {
  if (!_openrouter) {
    _openrouter = createOpenRouter({ apiKey: getApiKey() });
  }
  return _openrouter;
}

/**
 * 模型路由:
 *   "claude-xxx" (无斜杠) → anthropic provider (structured output)
 *   "anthropic/xxx" 等     → openrouter provider (tool calling)
 */
export function getModelInstance(model: string) {
  if (model.startsWith("claude-") && !model.includes("/")) {
    return getAnthropic()(model);
  }
  return getOpenRouter()(model);
}

// ── 模型常量 ──
// 对标 Claude Code: 主力 Sonnet, 快速任务 Haiku

export const MODELS = {
  /** 主力 agent 模型 — tool calling + 推理 */
  AGENT: "anthropic/claude-sonnet-4-6",
  /** 快速分类/判断 */
  FAST: "anthropic/claude-haiku-4-5",
  /** 结构化输出 (直连 Anthropic, 支持 Output.object) */
  STRUCTURED: "claude-sonnet-4-6",
} as const;

// ── Prompt Caching ──

export type SystemModelMessage = Extract<ModelMessage, { role: "system" }>;

export function cachedSystemMessage(
  text: string,
  cache = false
): SystemModelMessage {
  return {
    role: "system" as const,
    content: text,
    ...(cache && {
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" as const } },
      },
    }),
  };
}

// ── Retry ──

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (msg.includes("429") || msg.includes("rate limit")) return false;
  return (
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("fetch failed") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── 结构化生成 ──

interface StructuredOptions<T> {
  model: string;
  system?: string;
  systemMessages?: SystemModelMessage[];
  prompt: string;
  schema: z.ZodSchema<T>;
  schemaName?: string;
  schemaDescription?: string;
}

export async function generateStructured<T>(
  opts: StructuredOptions<T>
): Promise<T> {
  const model = getModelInstance(opts.model);
  const system = opts.systemMessages ?? opts.system;
  let lastError: unknown;

  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const { output } = await generateText({
        model,
        system: system as Parameters<typeof generateText>[0]["system"],
        prompt: opts.prompt,
        output: Output.object({
          schema: opts.schema,
          name: opts.schemaName,
          description: opts.schemaDescription,
        }),
      });
      if (output === undefined) throw new Error("generateStructured: undefined output");
      return output;
    } catch (err) {
      lastError = err;
      if (attempt < 1 && isRetryable(err)) { await sleep(1000); continue; }
    }
  }
  throw lastError;
}
