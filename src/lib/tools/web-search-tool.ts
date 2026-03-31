/**
 * WebSearchTool — 网络搜索
 *
 * 对标 Claude Code WebSearchTool:
 *   CC 用内部搜索 API
 *   我们用 DuckDuckGo HTML 解析 (无需 API key)
 *
 * 流程: query → fetch DDG HTML → 解析结果 → 返回 title + url + snippet
 */
import { tool } from "ai";
import { z } from "zod";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** 从 DuckDuckGo HTML 解析搜索结果 */
function parseDDGResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // DDG HTML 结果在 <a class="result__a"> 标签中
  const resultBlocks = html.split(/class="result__body"/);

  for (let i = 1; i < resultBlocks.length && results.length < 8; i++) {
    const block = resultBlocks[i]!;

    // 提取 URL 和标题
    const linkMatch = block.match(/href="([^"]+)"[^>]*class="result__a"[^>]*>([^<]+)/);
    const urlMatch = block.match(/href="(https?:\/\/[^"]+)"/);
    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a/);

    const url = urlMatch?.[1] ?? linkMatch?.[1] ?? "";
    const title = (titleMatch?.[1] ?? linkMatch?.[2] ?? "")
      .replace(/<[^>]+>/g, "").trim();
    const snippet = (snippetMatch?.[1] ?? "")
      .replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

    if (url && title) {
      results.push({ title, url, snippet });
    }
  }

  // Fallback: 简单 regex 提取链接
  if (results.length === 0) {
    const links = html.matchAll(/href="(https?:\/\/(?!duckduckgo)[^"]+)"[^>]*>([^<]{5,})<\/a>/g);
    for (const match of links) {
      if (results.length >= 8) break;
      const url = match[1]!;
      const title = match[2]!.trim();
      if (url && title && !url.includes("duckduckgo")) {
        results.push({ title, url, snippet: "" });
      }
    }
  }

  return results;
}

export function createWebSearchTool() {
  return tool({
    description:
      "Search the web for information. Returns a list of results with titles, URLs, and snippets. " +
      "Use this to find documentation, look up error messages, or research topics.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      max_results: z.number().int().min(1).max(10).default(5).describe("Max results"),
    }),
    execute: async ({ query, max_results }) => {
      const start = Date.now();

      try {
        const encoded = encodeURIComponent(query);
        const response = await fetch(
          `https://html.duckduckgo.com/html/?q=${encoded}`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; AIAgent/1.0)",
            },
            signal: AbortSignal.timeout(10_000),
          }
        );

        if (!response.ok) {
          return { error: `Search failed: HTTP ${response.status}`, query };
        }

        const html = await response.text();
        const results = parseDDGResults(html).slice(0, max_results);

        return {
          query,
          results,
          count: results.length,
          durationMs: Date.now() - start,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Search failed",
          query,
          durationMs: Date.now() - start,
        };
      }
    },
  });
}
