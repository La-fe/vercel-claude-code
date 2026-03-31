/**
 * Memory System — 对标 Claude Code memdir/
 *
 * Claude Code 记忆架构:
 *   - 目录: ~/.claude/projects/{slug}/memory/
 *   - 索引: MEMORY.md (max 200 lines, 25KB)
 *   - 主题文件: {topic}.md (YAML frontmatter + markdown body)
 *   - 4 种类型: user, feedback, project, reference
 *   - 注入: MEMORY.md 内容注入 system prompt
 *   - 扫描: scanMemoryFiles() 解析 frontmatter, 200 newest first
 *
 * 简化版实现:
 *   - 同样的目录结构和文件格式
 *   - 读取 MEMORY.md + 扫描主题文件
 *   - 注入 system prompt
 *   - 提供读写 API 给 tools 使用
 */
import * as fs from "fs/promises";
import * as path from "path";
import { cachedSystemMessage, type SystemModelMessage } from "../llm";

// ── 路径解析 ──

const MEMORY_DIR_NAME = "memory";
const MEMORY_INDEX = "MEMORY.md";
const MAX_INDEX_LINES = 200;
const MAX_INDEX_BYTES = 25_000;

/** 获取项目记忆目录 — 对标 getAutoMemPath() */
export function getMemoryDir(cwd: string): string {
  // 简化版: 直接在项目目录下 .agent/memory/
  return path.join(cwd, ".agent", MEMORY_DIR_NAME);
}

/** 确保记忆目录存在 — 对标 ensureMemoryDirExists() */
export async function ensureMemoryDir(cwd: string): Promise<string> {
  const dir = getMemoryDir(cwd);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// ── Memory 类型 ──

export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryHeader {
  filename: string;
  filePath: string;
  name: string;
  description: string;
  type: MemoryType;
  mtimeMs: number;
}

export interface MemoryFile extends MemoryHeader {
  content: string;
}

// ── Frontmatter 解析 ──

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const meta: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      meta[key] = val;
    }
  }
  return { meta, body: match[2] ?? "" };
}

function buildFrontmatter(meta: Record<string, string>): string {
  const lines = Object.entries(meta).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

// ── 扫描 — 对标 scanMemoryFiles() ──

export async function scanMemoryFiles(cwd: string): Promise<MemoryHeader[]> {
  const dir = getMemoryDir(cwd);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const headers: MemoryHeader[] = [];
  for (const filename of entries) {
    if (!filename.endsWith(".md") || filename === MEMORY_INDEX) continue;

    const filePath = path.join(dir, filename);
    try {
      const stat = await fs.stat(filePath);
      // 只读前 30 行 frontmatter (对标 Claude Code)
      const raw = await fs.readFile(filePath, "utf-8");
      const first30 = raw.split("\n").slice(0, 30).join("\n");
      const { meta } = parseFrontmatter(first30);

      headers.push({
        filename,
        filePath,
        name: meta.name ?? filename.replace(".md", ""),
        description: meta.description ?? "",
        type: (meta.type as MemoryType) ?? "project",
        mtimeMs: stat.mtimeMs,
      });
    } catch {
      // skip unreadable files
    }
  }

  // 按修改时间倒序，最多 200 个
  return headers
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 200);
}

// ── 读取 MEMORY.md 索引 ──

export async function readMemoryIndex(cwd: string): Promise<string | null> {
  const indexPath = path.join(getMemoryDir(cwd), MEMORY_INDEX);
  try {
    let content = await fs.readFile(indexPath, "utf-8");

    // 截断: 先按行，再按字节 (对标 Claude Code)
    const lines = content.split("\n");
    if (lines.length > MAX_INDEX_LINES) {
      content = lines.slice(0, MAX_INDEX_LINES).join("\n");
    }
    if (content.length > MAX_INDEX_BYTES) {
      content = content.slice(0, content.lastIndexOf("\n", MAX_INDEX_BYTES));
    }

    return content;
  } catch {
    return null;
  }
}

// ── 读取单个记忆文件 ──

export async function readMemoryFile(filePath: string): Promise<MemoryFile | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const stat = await fs.stat(filePath);
    const { meta, body } = parseFrontmatter(raw);
    return {
      filename: path.basename(filePath),
      filePath,
      name: meta.name ?? "",
      description: meta.description ?? "",
      type: (meta.type as MemoryType) ?? "project",
      mtimeMs: stat.mtimeMs,
      content: body,
    };
  } catch {
    return null;
  }
}

// ── 写入记忆文件 ──

export async function writeMemoryFile(
  cwd: string,
  filename: string,
  meta: { name: string; description: string; type: MemoryType },
  content: string
): Promise<string> {
  const dir = await ensureMemoryDir(cwd);
  const filePath = path.join(dir, filename.endsWith(".md") ? filename : `${filename}.md`);
  const frontmatter = buildFrontmatter({
    name: meta.name,
    description: meta.description,
    type: meta.type,
  });
  await fs.writeFile(filePath, frontmatter + "\n" + content, "utf-8");
  return filePath;
}

// ── 更新 MEMORY.md 索引 ──

export async function updateMemoryIndex(
  cwd: string,
  entry: string
): Promise<void> {
  const dir = await ensureMemoryDir(cwd);
  const indexPath = path.join(dir, MEMORY_INDEX);

  let existing = "";
  try {
    existing = await fs.readFile(indexPath, "utf-8");
  } catch {
    // file doesn't exist yet
  }

  // 避免重复
  if (existing.includes(entry)) return;

  const newContent = existing ? `${existing.trimEnd()}\n${entry}\n` : `${entry}\n`;
  await fs.writeFile(indexPath, newContent, "utf-8");
}

// ── 构建记忆 system prompt 片段 — 对标 buildMemoryPrompt() ──

export async function buildMemoryPromptPart(cwd: string): Promise<SystemModelMessage | null> {
  const index = await readMemoryIndex(cwd);
  if (!index) return null;

  const headers = await scanMemoryFiles(cwd);
  const manifest = headers
    .map((h) => `[${h.type}] ${h.filename} (${new Date(h.mtimeMs).toISOString().split("T")[0]}): ${h.description}`)
    .join("\n");

  const prompt = `## Memory

${index}

${manifest ? `### Memory files available:\n${manifest}` : ""}

You can read memory files with file_read and write new ones with file_write in the .agent/memory/ directory.`;

  return cachedSystemMessage(prompt, true);
}
