/**
 * GET /api/diff — 获取本次会话的文件修改摘要
 */
import { getFileChangeSummary, getFileChanges } from "@/lib/engine/file-tracker";

export async function GET() {
  return Response.json({
    summary: getFileChangeSummary(),
    changes: getFileChanges(),
    count: getFileChanges().length,
  });
}
