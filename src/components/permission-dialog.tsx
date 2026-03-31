/**
 * 权限确认弹窗 — 对标 Claude Code PermissionDialog
 *
 * CC 流程: tool 调用 → checkPermissions → dialog UI → approve/deny → 继续
 * 我们: tool 返回 needs_permission → 客户端渲染 Dialog → 用户点击 → 发送决策
 *
 * 用于 default 模式下的危险操作确认
 */
"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Check, X, Terminal } from "lucide-react";

interface PermissionRequest {
  toolName: string;
  input: Record<string, unknown>;
  reason?: string;
}

interface PermissionDialogProps {
  request: PermissionRequest;
  onAllow: () => void;
  onDeny: () => void;
  onAlwaysAllow?: () => void;
}

export function PermissionDialog({
  request,
  onAllow,
  onDeny,
  onAlwaysAllow,
}: PermissionDialogProps) {
  const { toolName, input, reason } = request;

  // 显示关键输入
  const preview = toolName === "bash"
    ? String(input.command ?? "")
    : toolName === "file_edit" || toolName === "file_write"
    ? String(input.file_path ?? "")
    : JSON.stringify(input).slice(0, 100);

  return (
    <Card className="border-yellow-800 bg-yellow-950/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-yellow-800/50">
        <ShieldAlert className="w-4 h-4 text-yellow-400" />
        <span className="text-sm font-semibold text-yellow-200">Permission Required</span>
        <Badge variant="outline" className="text-[9px] h-4 text-yellow-400 border-yellow-800">
          {toolName}
        </Badge>
      </div>

      {/* Preview */}
      <div className="px-3 py-2">
        {reason && (
          <p className="text-[11px] text-muted-foreground mb-2">{reason}</p>
        )}
        <div className="bg-card rounded px-2 py-1.5 font-mono text-[11px] text-foreground/80">
          {toolName === "bash" && <span className="text-yellow-400">$ </span>}
          {preview}
        </div>
      </div>

      {/* Actions — 对标 CC 的 Approve / Deny / Always Allow */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-yellow-800/50 bg-yellow-950/10">
        <Button
          size="sm"
          variant="default"
          className="h-7 text-xs gap-1"
          onClick={onAllow}
        >
          <Check className="w-3 h-3" />
          Allow
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="h-7 text-xs gap-1"
          onClick={onDeny}
        >
          <X className="w-3 h-3" />
          Deny
        </Button>
        {onAlwaysAllow && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 ml-auto"
            onClick={onAlwaysAllow}
          >
            <Terminal className="w-3 h-3" />
            Always Allow
          </Button>
        )}
      </div>
    </Card>
  );
}
