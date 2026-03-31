/**
 * Context Assembly — 对标 Claude Code context.ts
 *
 * Round 5: + 记忆召回 + Skills 注入
 *
 * 系统提示词组装顺序 (对标 Claude Code):
 *   1. 核心指令 + 环境 + Git (cached)
 *   2. CLAUDE.md 项目指令 (cached)
 *   3. Memory 索引 + manifest (cached)
 *   4. 召回的相关记忆 (per-turn, 不 cached)
 *   5. Skills 列表 (cached)
 */
import { exec } from "child_process";
import { readFile } from "fs/promises";
import * as path from "path";
import { cachedSystemMessage, type SystemModelMessage } from "../llm";
import { buildMemoryPromptPart } from "./memory";
import { recallRelevantMemories, formatRecalledMemories } from "./memory-recall";
import { loadAllSkills, formatSkillsForPrompt } from "./skills";

/** 获取 git 状态信息 */
async function getGitContext(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    exec(
      "git rev-parse --is-inside-work-tree && git branch --show-current && git status --short",
      { cwd, timeout: 5000 },
      (err, stdout) => {
        if (err) { resolve(null); return; }
        const lines = stdout.trim().split("\n");
        if (lines[0] !== "true") { resolve(null); return; }
        const branch = lines[1] || "unknown";
        const status = lines.slice(2).join("\n");
        resolve(`Git branch: ${branch}\n${status ? `Changes:\n${status}` : "Working tree clean"}`);
      }
    );
  });
}

/** 读取 CLAUDE.md */
async function readClaudeMd(cwd: string): Promise<string | null> {
  try {
    return (await readFile(path.join(cwd, "CLAUDE.md"), "utf-8")).slice(0, 10_000);
  } catch {
    return null;
  }
}

/**
 * 构建完整系统提示词 — 对标 fetchSystemPromptParts()
 *
 * @param userMessage - 当前用户消息 (用于记忆召回)
 */
export async function buildSystemPrompt(
  cwd: string,
  userMessage?: string
): Promise<SystemModelMessage[]> {
  // 并行加载所有上下文源
  const [gitContext, claudeMd, memoryPart, skills] = await Promise.all([
    getGitContext(cwd),
    readClaudeMd(cwd),
    buildMemoryPromptPart(cwd),
    loadAllSkills(cwd),
  ]);

  // 记忆召回 (依赖 userMessage, 不能并行)
  let recalledPart: string | null = null;
  if (userMessage) {
    const recalled = await recallRelevantMemories(userMessage, cwd);
    if (recalled.length > 0) {
      recalledPart = formatRecalledMemories(recalled);
    }
  }

  const messages: SystemModelMessage[] = [];

  // Part 1: 核心指令 + 环境 (cached)
  const skillsPrompt = formatSkillsForPrompt(skills);
  messages.push(cachedSystemMessage(`You are an AI coding assistant that helps users with software engineering tasks.
You have access to tools for reading files, editing files, searching code, running shell commands, fetching URLs, searching the web, and spawning sub-agents.

## Tools
- bash: run shell commands (git, builds, tests, scripts)
- file_read: read file contents with line numbers
- file_edit: edit files via string replacement
- file_write: create or overwrite files
- glob: find files by pattern
- grep: search file contents with regex
- web_fetch: fetch URL content (docs, APIs)
- web_search: search the web for information
- agent: spawn a sub-agent for complex multi-step subtasks
- ask_user: ask the user a question with predefined options

## Rules
- Read files before editing them to understand existing code
- Use the appropriate tool for each task (grep for searching, glob for finding files, etc.)
- When editing files, preserve existing patterns and style
- Run tests after making changes when possible
- Be concise in explanations, focus on the task
- If a task requires multiple steps, work through them systematically

## Environment
- Working directory: ${cwd}
- Platform: ${process.platform}
- Date: ${new Date().toISOString().split("T")[0]}
${gitContext ? `\n## Git Status\n${gitContext}` : ""}${skillsPrompt}`, true));

  // Part 2: CLAUDE.md
  if (claudeMd) {
    messages.push(cachedSystemMessage(`## Project Instructions (CLAUDE.md)\n${claudeMd}`, true));
  }

  // Part 3: Memory index + manifest (cached)
  if (memoryPart) {
    messages.push(memoryPart);
  }

  // Part 4: Recalled memories (per-turn, NOT cached)
  if (recalledPart) {
    messages.push(cachedSystemMessage(recalledPart, false));
  }

  return messages;
}
