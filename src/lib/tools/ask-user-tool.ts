/**
 * AskUserQuestion Tool — 对标 Claude Code AskUserQuestionTool
 *
 * Claude Code 流程:
 *   1. LLM 调用 tool: questions[] (每个含 question + header + options + multiSelect)
 *   2. UI 渲染: 选项卡片 + 预览面板 + 文本输入
 *   3. 用户选择 → answers map 返回 LLM
 *   4. LLM 根据答案继续
 *
 * Web 实现:
 *   - tool execute 返回问题结构 (不阻塞)
 *   - 客户端识别 "ask_user" 工具结果，渲染交互卡片
 *   - 用户选择后作为新消息发送
 *   - 这比 CC 的阻塞式简单，但在 Web 上更自然
 */
import { tool } from "ai";
import { z } from "zod";

const OptionSchema = z.object({
  label: z.string().describe("Display text for this option"),
  description: z.string().optional().describe("Explanation of this option"),
});

const QuestionSchema = z.object({
  question: z.string().describe("The question to ask the user"),
  header: z.string().max(12).optional().describe("Short label (max 12 chars)"),
  options: z.array(OptionSchema).min(2).max(4).describe("Available choices"),
  multiSelect: z.boolean().default(false).describe("Allow multiple selections"),
});

export function createAskUserTool() {
  return tool({
    description:
      "Ask the user a question with predefined options. " +
      "Use when you need user input to make a decision. " +
      "Each question has 2-4 options. Users can also provide free text.",
    inputSchema: z.object({
      questions: z.array(QuestionSchema).min(1).max(4).describe("Questions to ask (1-4)"),
    }),
    execute: async ({ questions }) => {
      // 返回问题结构，由客户端渲染交互 UI
      // 客户端会识别 operation: "ask_user" 并特殊处理
      return {
        operation: "ask_user" as const,
        questions: questions.map((q) => ({
          question: q.question,
          header: q.header,
          options: q.options,
          multiSelect: q.multiSelect,
        })),
        summary: `Asked ${questions.length} question(s) — waiting for user response`,
      };
    },
  });
}
