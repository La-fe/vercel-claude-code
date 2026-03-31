/**
 * 工具调用专用渲染器 — 对标 Claude Code components/messages/ 系列
 *
 * Claude Code 按工具类型做定制渲染:
 *   - BashTool → stdout/stderr 分离, 命令高亮
 *   - FileReadTool → 文件名 + 带行号内容
 *   - FileEditTool → StructuredDiff (git diff 风格)
 *   - GrepTool → 匹配行高亮
 *   - GlobTool → 文件列表
 *   - AgentTool → 子 agent 进度和结果
 *   - WebFetchTool → URL + 内容摘要
 *
 * 视觉状态 (对标 ToolUseLoader):
 *   - pending: 黄色脉冲
 *   - complete: 绿色 ✓
 *   - error: 红色 ✗
 */
"use client";

// ── 工具图标映射 ──

const TOOL_ICONS: Record<string, string> = {
  bash: "⚡",
  file_read: "📄",
  file_edit: "✏️",
  file_write: "📝",
  glob: "🔍",
  grep: "🔎",
  agent: "🤖",
  web_fetch: "🌐",
  ask_user: "❓",
};

const TOOL_COLORS: Record<string, string> = {
  bash: "border-yellow-700 bg-yellow-950",
  file_read: "border-blue-700 bg-blue-950",
  file_edit: "border-green-700 bg-green-950",
  file_write: "border-green-700 bg-green-950",
  glob: "border-purple-700 bg-purple-950",
  grep: "border-purple-700 bg-purple-950",
  agent: "border-cyan-700 bg-cyan-950",
  web_fetch: "border-orange-700 bg-orange-950",
  ask_user: "border-indigo-700 bg-indigo-950",
};

// ── Bash 渲染 (对标 BashToolResultMessage) ──

function BashToolRender({ input, output }: { input: Record<string, unknown>; output: Record<string, unknown> | null }) {
  const command = String(input.command ?? "");
  const stdout = output ? String((output as Record<string, unknown>).stdout ?? "") : "";
  const stderr = output ? String((output as Record<string, unknown>).stderr ?? "") : "";
  const exitCode = output ? Number((output as Record<string, unknown>).exitCode ?? 0) : null;
  const error = output ? String((output as Record<string, unknown>).error ?? "") : "";

  return (
    <div className="space-y-1">
      {/* 命令行 (对标 CC 的命令高亮) */}
      <div className="font-mono text-[11px] text-yellow-300 bg-gray-900 px-2 py-1 rounded">
        $ {command}
      </div>
      {/* stdout */}
      {stdout && (
        <pre className="text-[11px] text-gray-300 bg-gray-900/50 px-2 py-1 rounded overflow-auto max-h-64 whitespace-pre-wrap">
          {stdout.slice(0, 3000)}{stdout.length > 3000 ? "\n...[truncated]" : ""}
        </pre>
      )}
      {/* stderr */}
      {stderr && (
        <pre className="text-[11px] text-red-400 bg-red-950/30 px-2 py-1 rounded overflow-auto max-h-32 whitespace-pre-wrap">
          {stderr.slice(0, 1000)}
        </pre>
      )}
      {/* error */}
      {error && <div className="text-[11px] text-red-400">{error}</div>}
      {/* exit code badge */}
      {exitCode !== null && exitCode !== 0 && (
        <span className="text-[10px] text-red-400">exit code: {exitCode}</span>
      )}
    </div>
  );
}

// ── File Read 渲染 ──

function FileReadRender({ input, output }: { input: Record<string, unknown>; output: Record<string, unknown> | null }) {
  const filePath = String(input.file_path ?? "");
  const content = output ? String((output as Record<string, unknown>).content ?? "") : "";
  const totalLines = output ? Number((output as Record<string, unknown>).totalLines ?? 0) : 0;
  const error = output ? String((output as Record<string, unknown>).error ?? "") : "";

  if (error) return <div className="text-[11px] text-red-400">{error}</div>;

  return (
    <div className="space-y-1">
      <div className="text-[11px] text-blue-300 flex justify-between">
        <span className="font-mono">{filePath.split("/").pop()}</span>
        {totalLines > 0 && <span className="text-gray-500">{totalLines} lines</span>}
      </div>
      {content && (
        <pre className="text-[11px] text-gray-400 bg-gray-900/50 px-2 py-1 rounded overflow-auto max-h-48 font-mono whitespace-pre-wrap">
          {content.slice(0, 2000)}{content.length > 2000 ? "\n..." : ""}
        </pre>
      )}
    </div>
  );
}

// ── File Edit 渲染 (对标 StructuredDiff, 简化版) ──

function FileEditRender({ input, output }: { input: Record<string, unknown>; output: Record<string, unknown> | null }) {
  const filePath = String(input.file_path ?? "");
  const oldStr = String(input.old_string ?? "");
  const newStr = String(input.new_string ?? "");
  const error = output ? String((output as Record<string, unknown>).error ?? "") : "";
  const replacements = output ? Number((output as Record<string, unknown>).replacements ?? 0) : 0;

  if (error) return <div className="text-[11px] text-red-400">{error}</div>;

  return (
    <div className="space-y-1">
      <div className="text-[11px] text-green-300 font-mono">{filePath.split("/").pop()}</div>
      <div className="text-[10px] bg-gray-900/50 rounded overflow-hidden font-mono">
        {/* Removed lines */}
        {oldStr.split("\n").slice(0, 10).map((line, i) => (
          <div key={`old-${i}`} className="px-2 bg-red-950/40 text-red-300">
            <span className="text-red-500 mr-2">-</span>{line}
          </div>
        ))}
        {oldStr.split("\n").length > 10 && (
          <div className="px-2 text-gray-600">...+{oldStr.split("\n").length - 10} lines</div>
        )}
        {/* Added lines */}
        {newStr.split("\n").slice(0, 10).map((line, i) => (
          <div key={`new-${i}`} className="px-2 bg-green-950/40 text-green-300">
            <span className="text-green-500 mr-2">+</span>{line}
          </div>
        ))}
        {newStr.split("\n").length > 10 && (
          <div className="px-2 text-gray-600">...+{newStr.split("\n").length - 10} lines</div>
        )}
      </div>
      {replacements > 0 && (
        <span className="text-[10px] text-green-500">{replacements} replacement(s)</span>
      )}
    </div>
  );
}

// ── File Write 渲染 ──

function FileWriteRender({ input, output }: { input: Record<string, unknown>; output: Record<string, unknown> | null }) {
  const filePath = String(input.file_path ?? "");
  const error = output ? String((output as Record<string, unknown>).error ?? "") : "";
  const summary = output ? String((output as Record<string, unknown>).summary ?? "") : "";

  if (error) return <div className="text-[11px] text-red-400">{error}</div>;
  return (
    <div className="text-[11px]">
      <span className="text-green-300 font-mono">{filePath.split("/").pop()}</span>
      {summary && <span className="text-gray-500 ml-2">{summary}</span>}
    </div>
  );
}

// ── Grep 渲染 (对标 高亮匹配) ──

function GrepRender({ input, output }: { input: Record<string, unknown>; output: Record<string, unknown> | null }) {
  const pattern = String(input.pattern ?? "");
  const matches = output && Array.isArray((output as Record<string, unknown>).matches)
    ? (output as Record<string, unknown>).matches as string[]
    : [];
  const count = output ? Number((output as Record<string, unknown>).count ?? 0) : 0;

  return (
    <div className="space-y-1">
      <div className="text-[11px] text-purple-300">
        <span className="text-gray-500">pattern:</span> <span className="font-mono">{pattern}</span>
        <span className="text-gray-500 ml-2">{count} match(es)</span>
      </div>
      {matches.length > 0 && (
        <pre className="text-[10px] text-gray-400 bg-gray-900/50 px-2 py-1 rounded overflow-auto max-h-40 font-mono whitespace-pre-wrap">
          {matches.slice(0, 20).join("\n")}
          {matches.length > 20 ? `\n...+${matches.length - 20} more` : ""}
        </pre>
      )}
    </div>
  );
}

// ── Glob 渲染 ──

function GlobRender({ input, output }: { input: Record<string, unknown>; output: Record<string, unknown> | null }) {
  const pattern = String(input.pattern ?? "");
  const files = output && Array.isArray((output as Record<string, unknown>).files)
    ? (output as Record<string, unknown>).files as string[]
    : [];

  return (
    <div className="space-y-1">
      <div className="text-[11px] text-purple-300">
        <span className="font-mono">{pattern}</span>
        <span className="text-gray-500 ml-2">{files.length} file(s)</span>
      </div>
      {files.length > 0 && (
        <div className="text-[10px] text-gray-400 bg-gray-900/50 px-2 py-1 rounded max-h-32 overflow-auto font-mono">
          {files.slice(0, 15).map((f, i) => (
            <div key={i} className="text-blue-400">{f}</div>
          ))}
          {files.length > 15 && <div className="text-gray-600">...+{files.length - 15} more</div>}
        </div>
      )}
    </div>
  );
}

// ── Agent 渲染 ──

function AgentRender({ input, output }: { input: Record<string, unknown>; output: Record<string, unknown> | null }) {
  const desc = String(input.description ?? "");
  const status = output ? String((output as Record<string, unknown>).status ?? "") : "running";
  const result = output ? String((output as Record<string, unknown>).result ?? "") : "";
  const steps = output ? Number((output as Record<string, unknown>).steps ?? 0) : 0;

  return (
    <div className="space-y-1">
      <div className="text-[11px]">
        <span className="text-cyan-300">{desc}</span>
        {status === "completed" && <span className="text-green-400 ml-2">({steps} steps)</span>}
        {status === "error" && <span className="text-red-400 ml-2">failed</span>}
      </div>
      {result && (
        <pre className="text-[10px] text-gray-400 bg-gray-900/50 px-2 py-1 rounded overflow-auto max-h-40 whitespace-pre-wrap">
          {result.slice(0, 1500)}
        </pre>
      )}
    </div>
  );
}

// ── WebFetch 渲染 ──

function WebFetchRender({ input, output }: { input: Record<string, unknown>; output: Record<string, unknown> | null }) {
  const url = String(input.url ?? "");
  const bytes = output ? Number((output as Record<string, unknown>).bytes ?? 0) : 0;
  const durationMs = output ? Number((output as Record<string, unknown>).durationMs ?? 0) : 0;
  const error = output ? String((output as Record<string, unknown>).error ?? "") : "";
  const content = output ? String((output as Record<string, unknown>).content ?? "") : "";

  if (error) return <div className="text-[11px] text-red-400">{error}</div>;

  return (
    <div className="space-y-1">
      <div className="text-[11px] flex justify-between">
        <span className="text-orange-300 font-mono truncate max-w-[80%]">{url}</span>
        <span className="text-gray-500 shrink-0">{(bytes / 1024).toFixed(1)}KB {durationMs}ms</span>
      </div>
      {content && (
        <pre className="text-[10px] text-gray-400 bg-gray-900/50 px-2 py-1 rounded overflow-auto max-h-40 whitespace-pre-wrap">
          {content.slice(0, 1500)}{content.length > 1500 ? "\n..." : ""}
        </pre>
      )}
    </div>
  );
}

// ── AskUser 渲染 (对标 AskUserQuestionPermissionRequest) ──

interface AskUserQuestion {
  question: string;
  header?: string;
  options: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
}

function AskUserRender({
  output,
  onOptionClick,
}: {
  output: Record<string, unknown>;
  onOptionClick?: (answer: string) => void;
}) {
  const questions = (output.questions ?? []) as AskUserQuestion[];

  return (
    <div className="space-y-3">
      {questions.map((q, qi) => (
        <div key={qi} className="space-y-1.5">
          {q.header && (
            <span className="text-[10px] bg-indigo-800 text-indigo-200 px-1.5 py-0.5 rounded">{q.header}</span>
          )}
          <div className="text-[11px] text-indigo-200 font-medium">{q.question}</div>
          <div className="space-y-1">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                type="button"
                onClick={() => onOptionClick?.(opt.label)}
                className="w-full text-left px-2 py-1.5 bg-gray-800 border border-gray-700 rounded cursor-pointer hover:border-indigo-500 hover:bg-indigo-950 transition-colors group"
              >
                <div className="text-[11px] text-gray-200 group-hover:text-indigo-200">{opt.label}</div>
                {opt.description && (
                  <div className="text-[10px] text-gray-500 mt-0.5">{opt.description}</div>
                )}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-gray-600 italic">
            Click an option or type a custom response
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 通用 Fallback ──

function FallbackRender({ output }: { output: unknown }) {
  return (
    <pre className="text-[10px] text-gray-500 bg-gray-900/50 px-2 py-1 rounded overflow-auto max-h-32 whitespace-pre-wrap">
      {typeof output === "string" ? output : JSON.stringify(output, null, 2).slice(0, 1000)}
    </pre>
  );
}

// ── 导出: 按工具名路由到对应渲染器 ──

interface ToolRenderProps {
  toolName: string;
  input: Record<string, unknown> | null;
  output: unknown;
  isComplete: boolean;
  onOptionClick?: (answer: string) => void;
}

export function ToolCallRenderer({ toolName, input, output, isComplete, onOptionClick }: ToolRenderProps) {
  // 提取工具短名 (去掉 tool- 前缀)
  const name = toolName.replace(/^tool-/, "");
  const icon = TOOL_ICONS[name] ?? "⚙️";
  const colorClass = TOOL_COLORS[name] ?? "border-gray-700 bg-gray-900";

  // 状态指示 (对标 ToolUseLoader 3 态)
  const hasError = output && typeof output === "object" && "error" in (output as Record<string, unknown>);
  const isAskUser = name === "ask_user";
  const statusIcon = !isComplete ? "◌" : hasError ? "✗" : isAskUser ? "?" : "✓";
  const statusColor = !isComplete ? "text-yellow-400" : hasError ? "text-red-400" : isAskUser ? "text-indigo-400" : "text-green-400";

  // 工具标题摘要
  const titleHint = getTitleHint(name, input);

  return (
    <details className={`text-xs border rounded ${colorClass} ${!isComplete ? "animate-pulse" : ""}`} open={!!hasError || isAskUser}>
      <summary className="px-2 py-1.5 cursor-pointer flex items-center gap-1.5 select-none">
        <span className={`${statusColor} text-[10px]`}>{statusIcon}</span>
        <span>{icon}</span>
        <span className="font-semibold text-gray-200">{name}</span>
        {titleHint && <span className="text-gray-500 truncate ml-1">{titleHint}</span>}
      </summary>
      {isComplete && output != null && (
        <div className="px-2 py-1.5 border-t border-gray-800">
          {renderToolOutput(name, input ?? {}, output as Record<string, unknown>, onOptionClick)}
        </div>
      )}
    </details>
  );
}

/** 工具标题的简短提示 */
function getTitleHint(name: string, input: Record<string, unknown> | null): string {
  if (!input) return "";
  switch (name) {
    case "bash": return String(input.command ?? "").slice(0, 50);
    case "file_read":
    case "file_edit":
    case "file_write": {
      const p = String(input.file_path ?? "");
      return p.split("/").pop() ?? p;
    }
    case "glob": return String(input.pattern ?? "");
    case "grep": return String(input.pattern ?? "");
    case "agent": return String(input.description ?? "");
    case "web_fetch": {
      try { return new URL(String(input.url ?? "")).hostname; } catch { return ""; }
    }
    default: return "";
  }
}

/** 按工具名路由到渲染器 */
function renderToolOutput(name: string, input: Record<string, unknown>, output: Record<string, unknown>, onOptionClick?: (answer: string) => void) {
  switch (name) {
    case "bash": return <BashToolRender input={input} output={output} />;
    case "file_read": return <FileReadRender input={input} output={output} />;
    case "file_edit": return <FileEditRender input={input} output={output} />;
    case "file_write": return <FileWriteRender input={input} output={output} />;
    case "grep": return <GrepRender input={input} output={output} />;
    case "glob": return <GlobRender input={input} output={output} />;
    case "agent": return <AgentRender input={input} output={output} />;
    case "web_fetch": return <WebFetchRender input={input} output={output} />;
    case "ask_user": return <AskUserRender output={output} onOptionClick={onOptionClick} />;
    default: return <FallbackRender output={output} />;
  }
}
