/**
 * AgentTool — 子 Agent 生成
 *
 * 对标 Claude Code AgentTool 同步模式:
 *   1. 接收 prompt + description + model
 *   2. 组装子 agent 的 system prompt + tools
 *   3. 调用 generateText (同步等待)
 *   4. 返回子 agent 的输出
 *
 * 注意: 为避免循环依赖, 子 agent 的工具集通过参数传入
 */
import { tool, generateText, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import { getModelInstance, MODELS } from "../llm";
import { buildSystemPrompt } from "../engine/context";

export function createAgentTool(cwd: string, subTools: ToolSet) {
  return tool({
    description:
      "Launch a sub-agent to handle a complex, multi-step task. " +
      "The sub-agent has access to the same tools and works autonomously. " +
      "Use for tasks requiring multiple steps or deep exploration.",
    inputSchema: z.object({
      prompt: z
        .string()
        .describe("Detailed task description for the sub-agent"),
      description: z
        .string()
        .describe("Short 3-5 word summary"),
      model: z
        .enum(["sonnet", "haiku"])
        .optional()
        .describe("Model to use (default: sonnet)"),
    }),
    execute: async ({ prompt, description, model }): Promise<{
      status: string;
      description: string;
      result?: string;
      error?: string;
      steps?: number;
      summary: string;
    }> => {
      console.log(`[agent-tool] Spawning: ${description}`);

      const systemMessages = await buildSystemPrompt(cwd);
      const modelId = model === "haiku" ? MODELS.FAST : MODELS.AGENT;

      try {
        const result = await generateText({
          model: getModelInstance(modelId),
          system: systemMessages as Parameters<typeof generateText>[0]["system"],
          prompt: `You are a sub-agent. Complete this task thoroughly.\n\nTask: ${prompt}`,
          tools: subTools,
          stopWhen: stepCountIs(15),
        });

        const stepsCount = (await result.steps).length;

        return {
          status: "completed",
          description,
          result: result.text || "(no text output)",
          steps: stepsCount,
          summary: `Sub-agent "${description}" completed in ${stepsCount} steps`,
        };
      } catch (error) {
        return {
          status: "error",
          description,
          error: error instanceof Error ? error.message : "Unknown error",
          summary: `Sub-agent "${description}" failed`,
        };
      }
    },
  });
}
