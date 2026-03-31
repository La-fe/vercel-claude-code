/**
 * 代码块组件 — shiki 语法高亮
 *
 * 对标 Claude Code HighlightedCode:
 *   - CC 用 TextMate grammars via Ink
 *   - 我们用 shiki (同引擎) + Web 渲染
 *   - 懒加载 highlighter, 缓存实例
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";

// shiki 懒加载缓存
let highlighterPromise: Promise<import("shiki").Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((shiki) =>
      shiki.createHighlighter({
        themes: ["github-dark"],
        langs: [
          "typescript", "javascript", "tsx", "jsx", "json", "bash", "sh",
          "css", "html", "python", "rust", "go", "yaml", "markdown",
          "sql", "diff", "toml", "xml",
        ],
      })
    );
  }
  return highlighterPromise;
}

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  maxLines?: number;
}

export function CodeBlock({ code, language, filename, maxLines = 50 }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(code);

  // 截断过长代码
  const lines = code.split("\n");
  const truncated = lines.length > maxLines;
  const displayCode = truncated ? lines.slice(0, maxLines).join("\n") : code;

  useEffect(() => {
    codeRef.current = displayCode;
    let cancelled = false;

    getHighlighter()
      .then((hl) => {
        if (cancelled) return;
        const lang = language?.toLowerCase() ?? "text";
        const supported = hl.getLoadedLanguages();
        const useLang = supported.includes(lang) ? lang : "text";

        const result = hl.codeToHtml(displayCode, {
          lang: useLang,
          theme: "github-dark",
        });
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });

    return () => { cancelled = true; };
  }, [displayCode, language]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="my-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          {filename && (
            <span className="text-[11px] text-muted-foreground font-mono">{filename}</span>
          )}
          {language && (
            <Badge variant="secondary" className="text-[9px] h-4">{language}</Badge>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Copy"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>

      {/* Code */}
      {html ? (
        <div
          className="overflow-auto text-[12px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:p-3 [&_pre]:m-0 [&_code]:!bg-transparent"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="px-3 py-2 overflow-auto text-[12px] font-mono text-foreground/80 leading-relaxed">
          {displayCode}
        </pre>
      )}

      {truncated && (
        <div className="px-3 py-1 border-t border-border text-[10px] text-muted-foreground">
          +{lines.length - maxLines} more lines
        </div>
      )}
    </Card>
  );
}
