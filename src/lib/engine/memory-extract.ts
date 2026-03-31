/**
 * 自动记忆提取 — 对标 Claude Code services/extractMemories/
 *
 * Claude Code 流程:
 *   1. 触发: queryLoop 结束 + 无 tool calls (最终回复)
 *   2. 方法: fork agent 分析对话 transcript
 *   3. 跳过: 如果 assistant 已手动写入 memory 目录
 *   4. 输出: 写入 .agent/memory/ (frontmatter + body)
 *
 * 我们的实现:
 *   - 用 generateText (Haiku) 分析最近消息
 *   - 提取值得记住的信息
 *   - 写入 memory 文件 + 更新索引
 */
import { generateText } from "ai";
import type { UIMessage } from "ai";
import { getModelInstance, MODELS } from "../llm";
import { writeMemoryFile, updateMemoryIndex, getMemoryDir } from "./memory";
import type { MemoryType } from "./memory";

interface ExtractedMemory {
  filename: string;
  name: string;
  description: string;
  type: MemoryType;
  content: string;
}

/**
 * 从对话中自动提取值得记忆的信息
 *
 * 对标 Claude Code 的 extractMemories():
 *   - 分析最近 N 条消息
 *   - 识别 user/feedback/project/reference 类型
 *   - 跳过已在代码/git 中可推导的信息
 */
export async function extractMemories(
  messages: UIMessage[],
  cwd: string
): Promise<ExtractedMemory[]> {
  // 只分析最近 10 条消息
  const recent = messages.slice(-10);
  const transcript = recent
    .map((m) => {
      const role = m.role === "user" ? "Human" : "Assistant";
      const text = m.parts
        .filter((p) => p.type === "text")
        .map((p) => ("text" in p ? p.text : ""))
        .join("\n");
      return `${role}: ${text}`;
    })
    .filter((t) => t.length > 10)
    .join("\n\n");

  if (transcript.length < 100) return []; // 对话太短，不提取

  try {
    const { text } = await generateText({
      model: getModelInstance(MODELS.FAST),
      system: `You analyze conversations to extract information worth remembering for future sessions.

Types of memory:
- user: User's role, preferences, expertise (e.g. "senior Go developer", "prefers terse responses")
- feedback: Corrections or confirmed approaches (e.g. "don't mock DB in tests", "single PR preferred")
- project: Non-obvious facts about the project (e.g. "auth rewrite driven by compliance", "deploy freeze March 5")
- reference: Pointers to external resources (e.g. "bugs tracked in Linear project INGEST")

Do NOT extract:
- Code patterns derivable from reading the code
- Git history information
- Debugging solutions (the fix is in the code)
- Ephemeral task details

Output format (one per memory, or "NONE" if nothing worth saving):
---
FILENAME: descriptive-slug.md
NAME: Short name
TYPE: user|feedback|project|reference
DESCRIPTION: One-line description for index
CONTENT:
The actual memory content
---`,
      prompt: `Analyze this conversation and extract memories worth saving:\n\n${transcript}`,
    });

    return parseExtractedMemories(text);
  } catch (error) {
    console.error("[memory-extract] Failed:", error);
    return [];
  }
}

function parseExtractedMemories(text: string): ExtractedMemory[] {
  if (text.trim() === "NONE" || !text.includes("FILENAME:")) return [];

  const memories: ExtractedMemory[] = [];
  const blocks = text.split("---").filter((b) => b.includes("FILENAME:"));

  for (const block of blocks) {
    const filename = block.match(/FILENAME:\s*(.+)/)?.[1]?.trim();
    const name = block.match(/NAME:\s*(.+)/)?.[1]?.trim();
    const type = block.match(/TYPE:\s*(.+)/)?.[1]?.trim() as MemoryType;
    const description = block.match(/DESCRIPTION:\s*(.+)/)?.[1]?.trim();
    const content = block.match(/CONTENT:\n([\s\S]+)/)?.[1]?.trim();

    if (filename && name && type && description && content) {
      memories.push({ filename, name, description, type, content });
    }
  }

  return memories;
}

/** 保存提取的记忆到磁盘 — 对标 extractMemories 的写入逻辑 */
export async function saveExtractedMemories(
  memories: ExtractedMemory[],
  cwd: string
): Promise<number> {
  let saved = 0;
  for (const mem of memories) {
    try {
      await writeMemoryFile(cwd, mem.filename, {
        name: mem.name,
        description: mem.description,
        type: mem.type,
      }, mem.content);

      await updateMemoryIndex(
        cwd,
        `- [${mem.name}](${mem.filename}) — ${mem.description}`
      );
      saved++;
    } catch (error) {
      console.error(`[memory-extract] Failed to save ${mem.filename}:`, error);
    }
  }
  return saved;
}
