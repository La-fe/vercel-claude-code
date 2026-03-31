/**
 * Context Compaction — 对标 Claude Code services/compact/
 *
 * Claude Code 压缩策略:
 *   1. 触发条件: 消息 token 接近模型上下文窗口 (~80%)
 *   2. 压缩方式: 用 LLM 生成结构化摘要替换旧消息
 *   3. 保留: 最近 N 条消息不压缩
 *   4. 摘要结构: 主要请求 + 技术概念 + 文件变更 + 错误 + 下一步
 *
 * Vercel AI SDK 映射:
 *   - 无内置压缩，需手动实现
 *   - 用 generateText 生成摘要
 *   - 在 handleMessage 前检查并压缩
 */
import { generateText } from "ai";
import type { UIMessage } from "ai";
import { getModelInstance, MODELS } from "../llm";

/** 压缩配置 */
export interface CompactConfig {
  /** 触发压缩的 token 阈值 */
  maxTokens: number;
  /** 保留的最近消息数 */
  preserveRecent: number;
  /** 压缩后的目标 token 数 */
  targetTokens: number;
}

export const DEFAULT_COMPACT_CONFIG: CompactConfig = {
  maxTokens: 100_000,    // ~80% of 128K context
  preserveRecent: 6,     // 保留最近 6 条消息
  targetTokens: 50_000,  // 压缩后目标 50K
};

/** 粗略估算消息 token 数 (4 chars ≈ 1 token) */
export function estimateTokens(messages: UIMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "text" && "text" in part) {
        chars += (part.text as string).length;
      } else {
        // tool calls, etc. — 估算 JSON 长度
        chars += JSON.stringify(part).length;
      }
    }
  }
  return Math.ceil(chars / 4);
}

/** 判断是否需要压缩 */
export function needsCompaction(
  messages: UIMessage[],
  config: CompactConfig = DEFAULT_COMPACT_CONFIG
): boolean {
  return estimateTokens(messages) > config.maxTokens;
}

/**
 * 压缩消息 — 对标 Claude Code 的 autoCompact
 *
 * 流程:
 *   1. 将旧消息 (排除最近 N 条) 提取为文本
 *   2. 用 LLM 生成结构化摘要
 *   3. 返回 [摘要消息] + [最近 N 条原始消息]
 */
export async function compactMessages(
  messages: UIMessage[],
  config: CompactConfig = DEFAULT_COMPACT_CONFIG
): Promise<UIMessage[]> {
  if (messages.length <= config.preserveRecent) {
    return messages; // 消息太少，不压缩
  }

  const splitAt = messages.length - config.preserveRecent;
  const oldMessages = messages.slice(0, splitAt);
  const recentMessages = messages.slice(splitAt);

  // 提取旧消息文本
  const conversationText = oldMessages
    .map((msg) => {
      const role = msg.role === "user" ? "Human" : "Assistant";
      const text = msg.parts
        .filter((p) => p.type === "text")
        .map((p) => ("text" in p ? p.text : ""))
        .join("\n");

      // 工具调用摘要
      const toolSummaries = msg.parts
        .filter((p) => p.type !== "text" && "toolName" in p)
        .map((p) => {
          const name = (p as Record<string, unknown>).toolName ?? p.type;
          return `[Tool: ${name}]`;
        })
        .join(", ");

      return `${role}: ${text}${toolSummaries ? ` ${toolSummaries}` : ""}`;
    })
    .join("\n\n");

  // 对标 Claude Code compact prompt: 结构化摘要
  const { text: summary } = await generateText({
    model: getModelInstance(MODELS.FAST), // Haiku 快速压缩
    system: `You are a conversation summarizer. Create a concise structured summary.
Do NOT use any tools. Only output text.`,
    prompt: `Summarize this conversation into a structured summary that preserves all important context for continuing the work:

${conversationText}

Format your summary as:
## Summary of prior conversation
- **Primary request**: What the user originally asked for
- **Key decisions**: Important choices made
- **Files modified**: List of files changed and how
- **Current state**: Where things stand now
- **Next steps**: What remains to be done

Be concise but preserve technical details (file paths, function names, error messages).`,
  });

  // 构建压缩后的消息列表
  const compactMessage: UIMessage = {
    id: `compact-${Date.now()}`,
    role: "assistant",
    parts: [{ type: "text", text: `[Context compressed]\n\n${summary}` }],
  };

  return [compactMessage, ...recentMessages];
}
