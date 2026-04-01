/**
 * File Change Tracker — 对标 Claude Code 的文件历史追踪
 *
 * CC: FileHistoryManager 记录每次文件修改，支持 undo/revert
 * 我们: 简化版 — 记录修改列表，在 /cost 中展示
 *
 * 集成方式: file_edit/file_write 工具在 execute 后调用 trackChange()
 */

export interface FileChange {
  path: string;
  action: "edit" | "write" | "create";
  timestamp: number;
}

/** 内存中的文件修改记录 (session-scoped) */
const changes: FileChange[] = [];

export function trackFileChange(path: string, action: FileChange["action"]) {
  changes.push({ path, action, timestamp: Date.now() });
}

export function getFileChanges(): FileChange[] {
  return [...changes];
}

export function getFileChangeSummary(): string {
  if (changes.length === 0) return "No files modified";

  const byFile = new Map<string, FileChange["action"][]>();
  for (const c of changes) {
    const existing = byFile.get(c.path) ?? [];
    existing.push(c.action);
    byFile.set(c.path, existing);
  }

  const lines = [...byFile.entries()].map(
    ([path, actions]) => `  ${actions.includes("create") ? "+" : "~"} ${path} (${actions.join(", ")})`
  );

  return `${changes.length} change(s) across ${byFile.size} file(s):\n${lines.join("\n")}`;
}

export function clearFileChanges() {
  changes.length = 0;
}
