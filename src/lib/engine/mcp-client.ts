/**
 * MCP Client — 对标 Claude Code services/mcp/client.ts
 *
 * CC: connectToServer() → StdioTransport/SSE/WebSocket → client.connect()
 * CC: fetchToolsForClient() → tools/list → Tool[]
 * CC: callMCPTool() → client.callTool() → result
 *
 * 我们: 简化版 — SSE transport only (Web 环境), 工具自动发现
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { tool } from "ai";
import { z } from "zod";

export interface MCPServerConfig {
  /** 唯一 ID */
  id: string;
  /** 显示名 */
  name: string;
  /** SSE 端点 URL */
  url: string;
}

export interface MCPConnection {
  config: MCPServerConfig;
  client: Client;
  tools: MCPToolDef[];
}

interface MCPToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** 连接到 MCP Server — 对标 connectToServer() */
export async function connectMCPServer(
  config: MCPServerConfig
): Promise<MCPConnection> {
  const transport = new SSEClientTransport(new URL(config.url));

  const client = new Client(
    { name: "vercel-claude-code", version: "0.2.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  // 发现工具 — 对标 fetchToolsForClient()
  const result = await client.listTools();
  const tools: MCPToolDef[] = (result.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
  }));

  return { config, client, tools };
}

/** 将 MCP 工具转为 AI SDK tool() 格式 — 对标 MCPTool */
export function mcpToolsToAISDK(connection: MCPConnection) {
  const tools: Record<string, unknown> = {};

  for (const mcpTool of connection.tools) {
    const toolName = `mcp__${connection.config.id}__${mcpTool.name}`;

    tools[toolName] = tool({
      description: `[MCP: ${connection.config.name}] ${mcpTool.description}`,
      // MCP schema 直接透传 (AI SDK 会用 JSON Schema)
      inputSchema: z.object({}).passthrough(),
      execute: async (input) => {
        try {
          const result = await connection.client.callTool({
            name: mcpTool.name,
            arguments: input as Record<string, unknown>,
          });

          // 提取文本内容
          if (Array.isArray(result.content)) {
            const texts = result.content
              .filter((c): c is { type: "text"; text: string } => c.type === "text")
              .map((c) => c.text);
            return { result: texts.join("\n"), tool: mcpTool.name };
          }

          return { result: JSON.stringify(result.content), tool: mcpTool.name };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "MCP tool call failed",
            tool: mcpTool.name,
          };
        }
      },
    });
  }

  return tools;
}

/** 断开 MCP 连接 */
export async function disconnectMCPServer(connection: MCPConnection) {
  try {
    await connection.client.close();
  } catch {
    // ignore
  }
}
