/**
 * 结构化 Diff 组件 — 对标 Claude Code StructuredDiff
 *
 * CC 用 Rust NAPI ColorDiff (word-level highlighting)
 * 我们用 diff 库 (行级) + 着色
 */
"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { diffLines, type Change } from "diff";

interface DiffViewProps {
  oldText: string;
  newText: string;
  filename?: string;
  maxLines?: number;
}

export function DiffView({ oldText, newText, filename, maxLines = 60 }: DiffViewProps) {
  const changes = useMemo(() => diffLines(oldText, newText), [oldText, newText]);

  // 统计
  const stats = useMemo(() => {
    let added = 0, removed = 0;
    for (const change of changes) {
      const lines = change.value.split("\n").filter(Boolean).length;
      if (change.added) added += lines;
      if (change.removed) removed += lines;
    }
    return { added, removed };
  }, [changes]);

  // 渲染行 (带截断)
  let lineCount = 0;
  const renderedChanges: React.ReactNode[] = [];
  let truncated = false;

  for (let ci = 0; ci < changes.length; ci++) {
    const change = changes[ci]!;
    const lines = change.value.split("\n");
    // 去掉最后一个空行 (diff 库总是带尾部换行)
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

    for (let li = 0; li < lines.length; li++) {
      if (lineCount >= maxLines) { truncated = true; break; }
      const line = lines[li] ?? "";

      if (change.added) {
        renderedChanges.push(
          <div key={`${ci}-${li}`} className="flex bg-green-950/30 hover:bg-green-950/50 transition-colors">
            <span className="w-8 text-right pr-2 text-green-600 text-[10px] select-none shrink-0">+</span>
            <span className="text-green-300 text-[11px] font-mono whitespace-pre-wrap flex-1">{line}</span>
          </div>
        );
      } else if (change.removed) {
        renderedChanges.push(
          <div key={`${ci}-${li}`} className="flex bg-red-950/30 hover:bg-red-950/50 transition-colors">
            <span className="w-8 text-right pr-2 text-red-600 text-[10px] select-none shrink-0">-</span>
            <span className="text-red-300 text-[11px] font-mono whitespace-pre-wrap flex-1">{line}</span>
          </div>
        );
      } else {
        renderedChanges.push(
          <div key={`${ci}-${li}`} className="flex">
            <span className="w-8 text-right pr-2 text-muted-foreground/30 text-[10px] select-none shrink-0"> </span>
            <span className="text-muted-foreground text-[11px] font-mono whitespace-pre-wrap flex-1">{line}</span>
          </div>
        );
      }
      lineCount++;
    }
    if (truncated) break;
  }

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-border bg-card">
        {filename && (
          <span className="text-[11px] text-muted-foreground font-mono">{filename}</span>
        )}
        {stats.added > 0 && (
          <Badge variant="outline" className="text-[9px] h-4 text-green-400 border-green-800">
            +{stats.added}
          </Badge>
        )}
        {stats.removed > 0 && (
          <Badge variant="outline" className="text-[9px] h-4 text-red-400 border-red-800">
            -{stats.removed}
          </Badge>
        )}
      </div>

      {/* Diff lines */}
      <div className="overflow-auto max-h-80">
        {renderedChanges}
      </div>

      {truncated && (
        <div className="px-3 py-1 border-t border-border text-[10px] text-muted-foreground">
          +{lineCount} more lines
        </div>
      )}
    </Card>
  );
}
