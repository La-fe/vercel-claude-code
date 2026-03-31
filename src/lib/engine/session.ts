/**
 * 会话持久化 — 对标 Claude Code history.ts + commands/resume/
 *
 * Claude Code 会话存储:
 *   - ~/.claude/history.jsonl (JSONL, 含 prompt + pastedContents + timestamp)
 *   - sessionStorage.js 管理完整会话 (messages + metadata)
 *   - /resume 命令恢复会话
 *
 * 简化版:
 *   - .agent/sessions/{id}.json (JSON, 含 messages + metadata)
 *   - 自动保存 (每次 agent 回复后)
 *   - /resume 列出并选择会话
 */
import * as fs from "fs/promises";
import * as path from "path";
import type { UIMessage } from "ai";

export interface SessionMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  cwd: string;
}

export interface Session {
  metadata: SessionMetadata;
  messages: UIMessage[];
}

function getSessionsDir(cwd: string): string {
  return path.join(cwd, ".agent", "sessions");
}

/** 生成会话 ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 从消息中提取标题 (第一条用户消息的前 50 字) */
function extractTitle(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "Untitled session";
  const text = first.parts
    .filter((p) => p.type === "text")
    .map((p) => ("text" in p ? p.text : ""))
    .join(" ");
  return text.slice(0, 50) || "Untitled session";
}

/** 保存会话到磁盘 */
export async function saveSession(
  cwd: string,
  messages: UIMessage[],
  sessionId?: string
): Promise<string> {
  const dir = getSessionsDir(cwd);
  await fs.mkdir(dir, { recursive: true });

  const id = sessionId ?? generateId();
  const now = new Date().toISOString();

  const session: Session = {
    metadata: {
      id,
      title: extractTitle(messages),
      createdAt: now,
      updatedAt: now,
      messageCount: messages.length,
      cwd,
    },
    messages,
  };

  const filePath = path.join(dir, `${id}.json`);
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf-8");
  return id;
}

/** 列出所有会话 (最新在前) */
export async function listSessions(cwd: string): Promise<SessionMetadata[]> {
  const dir = getSessionsDir(cwd);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const sessions: SessionMetadata[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, entry), "utf-8");
      const session = JSON.parse(raw) as Session;
      sessions.push(session.metadata);
    } catch {
      // skip corrupt files
    }
  }

  return sessions.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** 加载指定会话 */
export async function loadSession(
  cwd: string,
  sessionId: string
): Promise<Session | null> {
  const filePath = path.join(getSessionsDir(cwd), `${sessionId}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}
