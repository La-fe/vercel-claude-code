/**
 * WebFetchTool — URL 内容获取
 *
 * 对标 Claude Code WebFetchTool:
 *   1. 验证 URL
 *   2. fetch HTML
 *   3. HTML → Markdown (简化版, 无 turndown 依赖)
 *   4. 截断过长内容
 *
 * Claude Code 额外功能 (未实现):
 *   - LRU cache (15 min)
 *   - 域名黑名单
 *   - Haiku 查询过滤
 *   - axios + redirect 处理
 */
import { tool } from "ai";
import { z } from "zod";

const MAX_CONTENT_CHARS = 50_000;

/** 简化版 HTML → 纯文本 */
function htmlToText(html: string): string {
  return html
    // Remove scripts and styles
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Convert common elements
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, "\n## $1\n")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n")
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Clean up whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createWebFetchTool() {
  return tool({
    description:
      "Fetch the content of a URL and return it as text. " +
      "Useful for reading documentation, API responses, web pages, etc.",
    inputSchema: z.object({
      url: z.string().url().describe("The URL to fetch"),
      raw: z.boolean().default(false).describe("Return raw HTML instead of converted text"),
    }),
    execute: async ({ url, raw }) => {
      const start = Date.now();

      try {
        // http → https upgrade (对标 Claude Code)
        const fetchUrl = url.replace(/^http:\/\//, "https://");

        const response = await fetch(fetchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; AIAgent/1.0)",
            Accept: "text/html,application/json,text/plain,*/*",
          },
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          return {
            error: `HTTP ${response.status}: ${response.statusText}`,
            url: fetchUrl,
          };
        }

        const contentType = response.headers.get("content-type") ?? "";
        const body = await response.text();
        const durationMs = Date.now() - start;

        // JSON 直接返回
        if (contentType.includes("json")) {
          const truncated = body.length > MAX_CONTENT_CHARS
            ? body.slice(0, MAX_CONTENT_CHARS) + "\n...[truncated]"
            : body;
          return { content: truncated, url: fetchUrl, bytes: body.length, durationMs, type: "json" };
        }

        // HTML → text
        const content = raw ? body : htmlToText(body);
        const truncated = content.length > MAX_CONTENT_CHARS
          ? content.slice(0, MAX_CONTENT_CHARS) + "\n...[truncated]"
          : content;

        return {
          content: truncated,
          url: fetchUrl,
          bytes: body.length,
          durationMs,
          type: raw ? "html" : "text",
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Fetch failed",
          url,
          durationMs: Date.now() - start,
        };
      }
    },
  });
}
