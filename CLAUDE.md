# vercel-claude-code

This is a Claude Code replica built with Vercel AI SDK. It reconstructs 29 core capabilities of Anthropic's Claude Code CLI in ~6,000 lines.

## Architecture

- `src/lib/engine/` — Agent engine (query loop, context, compact, memory, permissions)
- `src/lib/tools/` — 12 tools (bash, file ops, search, web, agent, ask_user)
- `src/components/` — shadcn UI (chat panel, tool renderers, code highlight, diff)
- `src/app/api/` — 4 API routes (chat, sessions, files, diff)

## Key patterns

- `streamText({ tools, stopWhen })` replaces Claude Code's entire queryLoop
- Tools use AI SDK `tool()` with Zod schemas
- Memory stored in `.agent/memory/` with YAML frontmatter
- Permission modes: auto (all allowed), plan (read-only), default (confirm dangerous)

## Dev

```bash
pnpm dev        # Start dev server
pnpm build      # Production build
```
