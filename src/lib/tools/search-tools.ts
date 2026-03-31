/**
 * Search Tools — 文件搜索
 *
 * 对标 Claude Code GlobTool + GrepTool:
 *   - Glob: 按模式搜索文件路径
 *   - Grep: 按正则搜索文件内容 (使用 ripgrep 或 fallback grep)
 */
import { tool } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import type { ToolContext } from "./types";

const MAX_RESULTS = 100;

export function createGlobTool(ctx: ToolContext) {
  return tool({
    description:
      "Find files matching a glob pattern. " +
      'Supports patterns like "**/*.ts", "src/**/*.tsx". ' +
      "Returns matching file paths.",
    inputSchema: z.object({
      pattern: z.string().describe("Glob pattern to match files"),
      path: z.string().optional().describe("Directory to search in (defaults to cwd)"),
    }),
    execute: async ({ pattern, path: searchPath }) => {
      const cwd = searchPath ?? ctx.cwd;
      // Use find + shell glob (works on macOS/Linux without Node 22)
      const escapedPattern = pattern.replace(/'/g, "'\\''");
      const cmd = `find '${cwd}' -path '*/${escapedPattern}' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -${MAX_RESULTS}`;

      return new Promise((resolve) => {
        exec(cmd, { maxBuffer: 2 * 1024 * 1024, timeout: 15_000 }, (err, stdout) => {
          if (err && !stdout) {
            resolve({ files: [], count: 0, message: "No matches" });
            return;
          }
          const files = stdout.trim().split("\n").filter(Boolean);
          resolve({
            files,
            count: files.length,
            truncated: files.length >= MAX_RESULTS,
          });
        });
      });
    },
  });
}

export function createGrepTool(ctx: ToolContext) {
  return tool({
    description:
      "Search file contents using regex patterns. " +
      "Uses ripgrep (rg) if available, falls back to grep. " +
      "Returns matching lines with file paths and line numbers.",
    inputSchema: z.object({
      pattern: z.string().describe("Regex pattern to search for"),
      path: z.string().optional().describe("File or directory to search in"),
      glob: z.string().optional().describe('File glob filter (e.g. "*.ts")'),
      case_insensitive: z.boolean().default(false).describe("Case insensitive search"),
      max_results: z.number().int().default(50).describe("Max results to return"),
    }),
    execute: async ({ pattern, path: searchPath, glob: fileGlob, case_insensitive, max_results }) => {
      const cwd = searchPath ?? ctx.cwd;
      const maxLines = Math.min(max_results, 250);

      // Try ripgrep first, fallback to grep
      const rgFlags = [
        "-n",                          // line numbers
        case_insensitive ? "-i" : "",
        fileGlob ? `--glob '${fileGlob}'` : "",
        `--max-count ${maxLines}`,
        "--no-heading",
        "--color never",
      ].filter(Boolean).join(" ");

      const command = `rg ${rgFlags} '${pattern.replace(/'/g, "'\\''")}' '${cwd}' 2>/dev/null || grep -rn ${case_insensitive ? "-i" : ""} '${pattern.replace(/'/g, "'\\''")}' '${cwd}' 2>/dev/null | head -${maxLines}`;

      return new Promise((resolve) => {
        exec(command, { maxBuffer: 5 * 1024 * 1024, timeout: 30_000 }, (err, stdout) => {
          if (err && !stdout) {
            resolve({ matches: [], count: 0, message: "No matches found" });
            return;
          }

          const lines = stdout.trim().split("\n").filter(Boolean);
          resolve({
            matches: lines.slice(0, maxLines),
            count: lines.length,
            truncated: lines.length >= maxLines,
          });
        });
      });
    },
  });
}
