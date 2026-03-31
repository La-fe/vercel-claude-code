/**
 * 记忆召回 — 对标 Claude Code memdir/findRelevantMemories.ts
 *
 * Claude Code 流程:
 *   1. scanMemoryFiles() → 获取所有记忆 header
 *   2. formatMemoryManifest() → 格式化为摘要列表
 *   3. sideQuery(Sonnet) → 选出 ≤5 条最相关记忆
 *   4. 排除已注入的记忆
 *   5. 返回文件路径列表
 *
 * 我们的实现:
 *   - 用 Haiku (更快更便宜) 做选择
 *   - 基于当前用户消息 + memory manifest 判断相关性
 */
import { generateText } from "ai";
import { getModelInstance, MODELS } from "../llm";
import {
  scanMemoryFiles,
  readMemoryFile,
  type MemoryHeader,
  type MemoryFile,
} from "./memory";

const MAX_RECALLED = 5;

/**
 * 召回与当前查询相关的记忆
 *
 * 对标 findRelevantMemories():
 *   - 输入: 用户最新消息 + 已注入的记忆 ID
 *   - 输出: 最相关的 ≤5 个记忆文件内容
 */
export async function recallRelevantMemories(
  userMessage: string,
  cwd: string,
  alreadyInjected: Set<string> = new Set()
): Promise<MemoryFile[]> {
  const headers = await scanMemoryFiles(cwd);
  if (headers.length === 0) return [];

  // 过滤已注入的
  const candidates = headers.filter((h) => !alreadyInjected.has(h.filename));
  if (candidates.length === 0) return [];

  // 如果候选少于 MAX_RECALLED，直接全部返回
  if (candidates.length <= MAX_RECALLED) {
    const files: MemoryFile[] = [];
    for (const h of candidates) {
      const f = await readMemoryFile(h.filePath);
      if (f) files.push(f);
    }
    return files;
  }

  // 用 LLM 选择最相关的记忆 (对标 sideQuery)
  const manifest = candidates
    .map((h, i) => `${i}: [${h.type}] ${h.filename} — ${h.description}`)
    .join("\n");

  try {
    const { text } = await generateText({
      model: getModelInstance(MODELS.FAST),
      system: `You select the most relevant memories for a user's current task.
Only include memories that are CERTAINLY helpful. Be selective.
Output ONLY the indices (comma-separated numbers), nothing else.
If none are relevant, output "NONE".`,
      prompt: `User's message: ${userMessage}

Available memories:
${manifest}

Select up to ${MAX_RECALLED} most relevant (indices only):`,
    });

    if (text.trim() === "NONE") return [];

    // 解析索引
    const indices = text
      .replace(/[^0-9,]/g, "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0 && n < candidates.length)
      .slice(0, MAX_RECALLED);

    // 读取选中的记忆
    const files: MemoryFile[] = [];
    for (const idx of indices) {
      const h = candidates[idx]!;
      const f = await readMemoryFile(h.filePath);
      if (f) files.push(f);
    }

    return files;
  } catch (error) {
    console.error("[memory-recall] Failed:", error);
    return [];
  }
}

/** 格式化召回的记忆为 system prompt 片段 */
export function formatRecalledMemories(memories: MemoryFile[]): string {
  if (memories.length === 0) return "";

  const parts = memories.map(
    (m) => `### ${m.name} (${m.type})\n${m.content}`
  );

  return `\n## Recalled Memories\n${parts.join("\n\n")}`;
}
