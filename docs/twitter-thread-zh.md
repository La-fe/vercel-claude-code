# Twitter 推文线程 — vercel-claude-code

---

## 主推文

我逆向了 Claude Code（51万行代码），用 Vercel AI SDK 5000 行重建了它。

关键发现：`streamText({ tools, stopWhen })` 一个函数调用，干掉了 Claude Code 4.6 万行的 Agent 循环代码。

已开源：github.com/La-fe/vercel-claude-code

下面说说我学到了什么 ↓

---

## 第 2 条 — 问题在哪

Claude Code 是目前最强的编程 Agent，没有之一。

但它有几个硬伤：
- 51 万行代码，Bun 运行时绑定
- 只能在终端里跑，锁死在 Anthropic CLI
- 没法嵌入你自己的产品，也没法在浏览器里用

如果能用一个轻量 Next.js 应用拿到它 90% 的能力呢？

---

## 第 3 条 — 架构上的秘密

Claude Code 的核心是一个 while(true) 死循环：

```
调 LLM → 解析 tool_use → 执行工具 → 
打包结果 → 再调 LLM → 循环往复
```

Vercel AI SDK 一个函数搞定全部：

```typescript
streamText({
  model: anthropic("claude-sonnet-4-6"),
  tools: { bash, fileRead, fileEdit, grep },
  stopWhen: stepCountIs(25),
})
```

4.6 万行 → 8 行。

---

## 第 4 条 — SDK 白送你的东西

这些事 Claude Code 手搓了上万行，AI SDK 内置就有：

- 流式 LLM 响应
- 工具调用解析 + 自动执行
- 多步工具循环（调完一个接着调下一个）
- 客户端消息状态管理（useChat）
- HTTP 流式传输
- UIMessage 协议

总共省掉约 7,400 行代码。

---

## 第 5 条 — 你还得自己写什么

SDK 管传输层。产品层得你来：

```
┌── 你的代码 ────────────────┐
│ 上下文组装                  │
│ 记忆系统                    │
│ 权限管控                    │
│ Token 预算                  │
│ 错误恢复                    │
│ 工具定义                    │
├── AI SDK（免费）─────────────┤
│ streamText, tool, useChat   │
├── LLM 服务商 ───────────────┤
│ Claude Sonnet / Haiku       │
└─────────────────────────────┘
```

这层才是你产品真正的护城河。

---

## 第 6 条 — 重建了 22 项核心能力

完整复刻清单：

🔧 11 个工具（bash、文件读写编辑、glob、grep、网页抓取、网络搜索、子 Agent、用户问答）
🧠 记忆系统（自动提取 + 智能召回）
📦 上下文压缩（自动 + 应急压缩）
💰 Token/美元预算追踪
🔒 3 种权限模式（auto/plan/default）
⚡ 斜杠命令（/help, /compact, /cost, /plan）
💾 会话自动保存 + 恢复
🎨 shadcn 暗黑终端 UI + shiki 语法高亮

---

## 第 7 条 — 4 个值得偷的设计模式

从 Claude Code 源码里提炼出来的：

1. **模型路由**：`claude-xxx` 走 Anthropic，`org/model` 走 OpenRouter —— 一个工厂函数搞定多供应商

2. **防递归子 Agent**：把工具集传给子 Agent 时去掉 agent 工具本身，天然防无限嵌套

3. **提示词缓存**：静态指令段开 Anthropic ephemeral cache，每轮动态的记忆段不缓存

4. **权限拦截**：危险命令不直接执行，返回 `needs_permission`，让前端弹确认框

---

## 第 8 条 — 数据说话

```
Claude Code:  512,664 行 / 1,902 个文件
我们的复刻:     5,088 行 /    47 个文件
压缩比:            100 倍

开发过程:    12 轮迭代
技术栈:      Next.js 16 + AI SDK 6 + shadcn
运行成本:    约 $0.003/轮 (Sonnet + Haiku)
```

---

## 第 9 条 — 3 步跑起来

```bash
git clone github.com/La-fe/vercel-claude-code
cd vercel-claude-code
cp .env.example .env  # 填入 OPENROUTER_API_KEY
pnpm install && pnpm dev
```

打开 localhost:3000，你就有自己的 Claude Code 了。

Next.js 能跑的地方它都能跑。部署到 Vercel 只要 30 秒。

---

## 第 10 条 — 为什么这件事重要

Claude Code 证明了 AI Agent 已经可以上生产。

Vercel AI SDK 证明了你不需要 50 万行代码来造一个。

真正的复杂度不在 LLM 调用循环 —— 而在编排层：记忆、权限、上下文管理。

那才是你产品住的地方。

觉得有用就 Star：github.com/La-fe/vercel-claude-code

---

## 标签

#AI #VercelAI #ClaudeCode #AI编程 #AIAgent #NextJS #开源 #Anthropic #Claude
