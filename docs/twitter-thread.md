# Twitter Thread — vercel-claude-code

---

## Main Tweet

I reverse-engineered Claude Code (512K lines) and rebuilt it in 5,000 lines with @veraborhern AI SDK.

The secret? `streamText({ tools, stopWhen })` replaces 46,000 lines of agent loop code.

Open-sourced: github.com/La-fe/vercel-claude-code

🧵 Here's what I learned ↓

---

## Tweet 2 — The Problem

Claude Code is an incredible coding agent.

But it's:
- A 512K-line Electron/Bun app
- Locked to Anthropic's CLI
- Can't run in a browser or embed in your app

What if you could get 90% of its capabilities in a lightweight Next.js app?

---

## Tweet 3 — The Architecture Secret

Claude Code's core is a while(true) loop:

```
call LLM → parse tool_use → execute → 
package result → call LLM again → repeat
```

Vercel AI SDK does ALL of this in one function:

```typescript
streamText({
  model: anthropic("claude-sonnet-4-6"),
  tools: { bash, fileRead, fileEdit, grep },
  stopWhen: stepCountIs(25),
})
```

46,000 lines → 8 lines.

---

## Tweet 4 — What You Get For Free

Things AI SDK handles that Claude Code builds from scratch:

- Streaming LLM responses ✅
- Tool call parsing + execution ✅  
- Multi-step tool loops ✅
- Message state management (useChat) ✅
- HTTP transport ✅
- UIMessage streaming ✅

Total lines eliminated: ~7,400

---

## Tweet 5 — What You Still Need to Build

The SDK handles transport. You build the product:

```
┌── Your Code ──────────────┐
│ Context assembly          │
│ Memory system             │
│ Permission checks         │
│ Token budgeting           │
│ Error recovery            │
│ Tool definitions          │
├── AI SDK (free) ──────────┤
│ streamText, tool, useChat │
├── LLM Provider ───────────┤
│ Claude Sonnet / Haiku     │
└───────────────────────────┘
```

---

## Tweet 6 — 22 Capabilities Rebuilt

What we replicated:

🔧 10 tools (bash, file CRUD, glob, grep, web fetch/search, sub-agent, ask user)
🧠 Memory system (auto-extract + smart recall)
📦 Context compression (auto + reactive compact)
💰 Token/USD budget tracking
🔒 3 permission modes (auto/plan/default)
⚡ Slash commands (/help, /compact, /cost, /plan)
💾 Session save/resume
🎨 shadcn terminal UI with shiki syntax highlighting

---

## Tweet 7 — The Key Design Patterns

4 patterns worth stealing:

1. **Provider routing**: `claude-xxx` → Anthropic, `org/model` → OpenRouter

2. **Anti-recursion sub-agents**: pass tools WITHOUT the agent tool itself

3. **Prompt caching**: static sections cached, per-turn memories not

4. **Permission interception**: dangerous commands return `needs_permission` instead of executing

---

## Tweet 8 — Numbers

```
Claude Code:  512,664 lines / 1,902 files
Our replica:    5,088 lines /    47 files
Compression:      100x

Build time:     12 rounds of iterative development
Tech:           Next.js 16 + AI SDK 6 + shadcn
Cost to run:    ~$0.003/turn (Sonnet + Haiku)
```

---

## Tweet 9 — Try It

```bash
git clone github.com/La-fe/vercel-claude-code
cd vercel-claude-code
cp .env.example .env  # add OPENROUTER_API_KEY
pnpm install && pnpm dev
```

Open localhost:3000 → you have your own Claude Code.

Runs anywhere Next.js runs. Deploy to Vercel in 30 seconds.

---

## Tweet 10 — Why This Matters

Claude Code proved that AI agents are production-ready.

Vercel AI SDK proved you don't need 500K lines to build one.

The real complexity isn't the LLM call loop — it's the orchestration: memory, permissions, context management.

That's where your product lives.

Star if useful: github.com/La-fe/vercel-claude-code

---

## Hashtags

#AI #VercelAI #ClaudeCode #AIAgent #NextJS #OpenSource #CodingAgent #Anthropic #Claude
