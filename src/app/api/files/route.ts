/**
 * GET /api/files?cwd=...&q=... — 文件搜索 API
 *
 * 对标 CC 的 FileIndex (nucleo Rust) — 简化为 git ls-files + find
 */
import { NextRequest } from "next/server";
import { exec } from "child_process";

export async function GET(req: NextRequest) {
  const cwd = req.nextUrl.searchParams.get("cwd") || process.cwd();
  const query = req.nextUrl.searchParams.get("q") || "";
  const limit = 15;

  // 优先用 git ls-files (快速, 只列 tracked 文件)
  // fallback 到 find
  const cmd = query
    ? `(git ls-files 2>/dev/null || find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*') | grep -i '${query.replace(/'/g, "'\\''")}' | head -${limit}`
    : `(git ls-files 2>/dev/null || find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*') | head -${limit}`;

  return new Promise<Response>((resolve) => {
    exec(cmd, { cwd, timeout: 5000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      const files = (stdout || "").trim().split("\n").filter(Boolean);
      resolve(Response.json(files));
    });
  });
}
