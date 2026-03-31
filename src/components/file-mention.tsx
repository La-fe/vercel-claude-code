/**
 * @ 文件提及补全 — 对标 CC PromptInput 的 parseReferences
 *
 * CC: Rust FileIndex (nucleo) → 模糊匹配 git-tracked 文件
 * 我们: /api/files → grep 过滤 → Popover 选择
 *
 * 流程: 输入 @ → 弹出文件列表 → 按键过滤 → 选中 → 注入路径
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { FileText } from "lucide-react";

interface FileMentionProps {
  /** 当前输入文本 */
  input: string;
  /** 是否可见 */
  visible: boolean;
  /** 工作目录 */
  cwd: string;
  /** 选中文件回调 */
  onSelect: (filePath: string) => void;
  /** 关闭回调 */
  onClose: () => void;
}

export function FileMentionPopover({
  input,
  visible,
  cwd,
  onSelect,
  onClose,
}: FileMentionProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 提取 @ 后面的查询文本
  const atIdx = input.lastIndexOf("@");
  const query = atIdx >= 0 ? input.slice(atIdx + 1) : "";

  // 搜索文件 (debounced)
  useEffect(() => {
    if (!visible) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams({ cwd, q: query });
      fetch(`/api/files?${params}`)
        .then((r) => r.json())
        .then((data: string[]) => {
          setFiles(data);
          setSelectedIndex(0);
        })
        .catch(() => setFiles([]));
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [visible, query, cwd]);

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || files.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, files.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = files[selectedIndex];
        if (selected) onSelect(selected);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [visible, files, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    if (visible) {
      window.addEventListener("keydown", handleKeyDown, true);
      return () => window.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [visible, handleKeyDown]);

  if (!visible || files.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 w-80 max-h-64 overflow-y-auto bg-popover border border-border rounded-md shadow-lg z-50">
      <div className="px-2 py-1 border-b border-border text-[10px] text-muted-foreground">
        Files {query && `matching "${query}"`}
      </div>
      {files.map((file, i) => (
        <button
          key={file}
          type="button"
          onClick={() => onSelect(file)}
          className={`w-full text-left px-2 py-1.5 text-[11px] font-mono flex items-center gap-1.5 transition-colors ${
            i === selectedIndex
              ? "bg-accent text-accent-foreground"
              : "text-popover-foreground hover:bg-accent/50"
          }`}
        >
          <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="truncate">{file}</span>
        </button>
      ))}
    </div>
  );
}
