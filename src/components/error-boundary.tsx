/**
 * Error Boundary — 对标 Claude Code SentryErrorBoundary
 *
 * 捕获 React 渲染错误，显示友好提示而非白屏
 */
"use client";

import { Component, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center h-full bg-background p-8">
          <Card className="max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="font-semibold">Something went wrong</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Try again
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
