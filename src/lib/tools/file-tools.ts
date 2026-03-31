/**
 * File Tools — 文件读写编辑
 *
 * 对标 Claude Code FileReadTool + FileEditTool + FileWriteTool:
 *   - FileRead: 读取文件内容 (带行号, 支持 offset/limit)
 *   - FileEdit: 字符串替换编辑 (old_string → new_string)
 *   - FileWrite: 创建/覆写文件
 */
import { tool } from "ai";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolContext } from "./types";

function resolvePath(filePath: string, cwd: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
}

export function createFileReadTool(ctx: ToolContext) {
  return tool({
    description:
      "Read a file's contents. Returns lines with line numbers. " +
      "Use offset and limit for large files.",
    inputSchema: z.object({
      file_path: z.string().describe("Absolute or relative file path"),
      offset: z.number().int().min(0).optional().describe("Line number to start from (0-based)"),
      limit: z.number().int().min(1).optional().describe("Max lines to read"),
    }),
    execute: async ({ file_path, offset, limit }) => {
      const resolved = resolvePath(file_path, ctx.cwd);
      try {
        const content = await fs.readFile(resolved, "utf-8");
        let lines = content.split("\n");

        if (offset !== undefined) lines = lines.slice(offset);
        if (limit !== undefined) lines = lines.slice(0, limit);

        const startLine = (offset ?? 0) + 1;
        const numbered = lines.map((line, i) => `${startLine + i}\t${line}`).join("\n");

        return {
          content: numbered,
          totalLines: content.split("\n").length,
          file: resolved,
        };
      } catch (err) {
        return { error: `Failed to read ${resolved}: ${(err as Error).message}` };
      }
    },
  });
}

export function createFileEditTool(ctx: ToolContext) {
  return tool({
    description:
      "Edit a file by replacing an exact string with a new string. " +
      "The old_string must match exactly (including whitespace). " +
      "Use replace_all to replace all occurrences.",
    inputSchema: z.object({
      file_path: z.string().describe("File to edit"),
      old_string: z.string().describe("Exact string to find and replace"),
      new_string: z.string().describe("Replacement string"),
      replace_all: z.boolean().default(false).describe("Replace all occurrences"),
    }),
    execute: async ({ file_path, old_string, new_string, replace_all }) => {
      if (!ctx.allowWrite) {
        return { error: "Write operations not allowed in current permission mode" };
      }

      const resolved = resolvePath(file_path, ctx.cwd);
      try {
        const content = await fs.readFile(resolved, "utf-8");

        if (!content.includes(old_string)) {
          return { error: `old_string not found in ${file_path}. Make sure it matches exactly.` };
        }

        const newContent = replace_all
          ? content.replaceAll(old_string, new_string)
          : content.replace(old_string, new_string);

        await fs.writeFile(resolved, newContent, "utf-8");

        const count = replace_all
          ? content.split(old_string).length - 1
          : 1;

        return {
          success: true,
          file: resolved,
          replacements: count,
          summary: `Edited ${file_path}: ${count} replacement(s)`,
        };
      } catch (err) {
        return { error: `Failed to edit ${resolved}: ${(err as Error).message}` };
      }
    },
  });
}

export function createFileWriteTool(ctx: ToolContext) {
  return tool({
    description:
      "Create a new file or overwrite an existing file with the given content.",
    inputSchema: z.object({
      file_path: z.string().describe("File path to write"),
      content: z.string().describe("File content"),
    }),
    execute: async ({ file_path, content }) => {
      if (!ctx.allowWrite) {
        return { error: "Write operations not allowed in current permission mode" };
      }

      const resolved = resolvePath(file_path, ctx.cwd);
      try {
        // Ensure parent directory exists
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, content, "utf-8");

        return {
          success: true,
          file: resolved,
          summary: `Wrote ${content.split("\n").length} lines to ${file_path}`,
        };
      } catch (err) {
        return { error: `Failed to write ${resolved}: ${(err as Error).message}` };
      }
    },
  });
}
