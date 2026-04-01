/**
 * POST /api/chat — Agent 对话端点
 *
 * Round 2: 集成 Compact + Token Budget
 *
 * 对标 Claude Code:
 *   - 自动压缩过长对话
 *   - 跟踪 token 用量和花费
 *   - 超预算时停止
 *   - Reactive compact: prompt-too-long 自动恢复
 */
import { NextRequest } from "next/server";
import {
  handleMessage,
  createBudgetTracker,
  type BudgetTracker,
} from "@/lib/engine/agent";
import { compactMessages } from "@/lib/engine/compact";
import type { UIMessage } from "ai";

export const maxDuration = 300;

// 服务端 budget tracker 缓存 (简化版，生产环境应用 Redis/DB)
const sessionBudgets = new Map<string, BudgetTracker>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      cwd,
      permissionMode,
      model,
      sessionId = "default",
    } = body as {
      messages: UIMessage[];
      cwd?: string;
      permissionMode?: "default" | "auto" | "plan";
      model?: string;
      sessionId?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages required" }, { status: 400 });
    }

    // 获取或创建 budget tracker (对标 Claude Code 的 QueryEngine 跨轮状态)
    let tracker = sessionBudgets.get(sessionId);
    if (!tracker) {
      tracker = createBudgetTracker();
      sessionBudgets.set(sessionId, tracker);
    }

    // 调用 agent engine (内含 auto compact + budget check)
    let result;
    try {
      result = await handleMessage({
        messages,
        config: {
          cwd: cwd || process.cwd(),
          permissionMode: permissionMode ?? "auto",
          model: model,
          maxSteps: 25,
        },
        budgetTracker: tracker,
      });
    } catch (error) {
      // ── Reactive Compact (对标 Claude Code 的 isPromptTooLongMessage) ──
      const errMsg = error instanceof Error ? error.message : "";
      if (errMsg.includes("too long") || errMsg.includes("token") || errMsg.includes("context_length")) {
        console.log("[chat] Prompt too long, reactive compacting...");
        const compacted = await compactMessages(messages, {
          maxTokens: 50_000,
          preserveRecent: 4,
          targetTokens: 25_000,
        });

        result = await handleMessage({
          messages: compacted,
          config: {
            cwd: cwd || process.cwd(),
            permissionMode: permissionMode ?? "auto",
            maxSteps: 25,
          },
          budgetTracker: tracker,
        });
      } else {
        throw error;
      }
    }

    // 更新缓存
    sessionBudgets.set(sessionId, result.budgetTracker);

    // 返回流式响应
    const response = result.stream.toUIMessageStreamResponse();

    // 附加 budget 状态到 response headers
    if (result.budgetStatus) {
      response.headers.set("X-Budget-Status", result.budgetStatus);
    }
    if (result.wasCompacted) {
      response.headers.set("X-Was-Compacted", "true");
    }

    return response;
  } catch (error) {
    console.error("[chat] Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
