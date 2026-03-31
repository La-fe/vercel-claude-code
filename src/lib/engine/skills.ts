/**
 * Skill 系统 — 对标 Claude Code skills/
 *
 * Claude Code Skill 架构:
 *   - Bundled: TypeScript objects + getPromptForCommand()
 *   - Disk: Markdown + frontmatter (name, description, whenToUse, tools)
 *   - 加载: bundledSkills.ts + loadSkillsDir.ts
 *   - 调用: /skillname → 注入 prompt + 限制 tools
 *
 * 我们的实现:
 *   - 统一 Markdown frontmatter 格式
 *   - 从 .agent/skills/ 目录加载
 *   - 注入 system prompt (skill 描述) + 按需加载完整 prompt
 */
import * as fs from "fs/promises";
import * as path from "path";

export interface Skill {
  name: string;
  description: string;
  whenToUse: string;
  /** 允许的工具列表 (空 = 全部) */
  allowedTools: string[];
  /** 完整 prompt 内容 */
  prompt: string;
  /** 来源文件路径 */
  filePath: string;
}

/** 从 frontmatter markdown 解析 skill */
function parseSkill(raw: string, filePath: string): Skill | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const meta: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      meta[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
    }
  }

  const name = meta.name;
  if (!name) return null;

  return {
    name,
    description: meta.description ?? "",
    whenToUse: meta.whenToUse ?? meta.when_to_use ?? "",
    allowedTools: meta.allowedTools
      ? meta.allowedTools.split(",").map((s) => s.trim())
      : [],
    prompt: match[2]?.trim() ?? "",
    filePath,
  };
}

/** 从目录加载所有 skills — 对标 loadSkillsDir() */
export async function loadSkillsFromDir(dir: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  let entries: string[];

  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const filePath = path.join(dir, entry);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const skill = parseSkill(raw, filePath);
      if (skill) skills.push(skill);
    } catch {
      // skip unreadable
    }
  }

  return skills;
}

/** 获取项目 skills 目录 */
export function getSkillsDir(cwd: string): string {
  return path.join(cwd, ".agent", "skills");
}

/** 加载项目 + 全局 skills */
export async function loadAllSkills(cwd: string): Promise<Skill[]> {
  const projectSkills = await loadSkillsFromDir(getSkillsDir(cwd));
  // 未来可加载 ~/.agent/skills/ 全局 skills
  return projectSkills;
}

/** 格式化 skills 为 system prompt 片段 */
export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";

  const lines = skills.map(
    (s) => `- **/${s.name}**: ${s.description}${s.whenToUse ? ` — Use when: ${s.whenToUse}` : ""}`
  );

  return `\n## Available Skills\nThe user can invoke these skills with /<name>:\n${lines.join("\n")}`;
}

/** 根据名称查找 skill */
export function findSkill(skills: Skill[], name: string): Skill | undefined {
  return skills.find(
    (s) => s.name === name || s.name === name.replace(/^\//, "")
  );
}
