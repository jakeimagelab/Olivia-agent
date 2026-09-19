"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { OliviaErrorView } from "@/components/errors/OliviaErrorView";
import { logOliviaError } from "@/lib/errors/errorDiagnostics";

// 스펙 1-28 — 특정 App Window가 crash해도 전체 Desktop이 죽지 않게 한다. React 에러 바운더리는
// 클래스 컴포넌트로만 만들 수 있다(hook으로 대체 불가).
type Props = { appId: string; appTitle: string; windowId: string; context?: WindowContext; resetKey?: string; children: ReactNode };
type State = { error: unknown | null };

export class AppWindowErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    logOliviaError("app-window", error, {
      appId: this.props.appId,
      appTitle: this.props.appTitle,
      windowId: this.props.windowId,
      context: this.props.context,
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(previousProps: Props) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <OliviaErrorView
          compact
          error={this.state.error}
          title={`${this.props.appTitle}을(를) 불러오지 못했습니다.`}
          description="이 창에서만 오류가 발생했습니다. 다른 앱과 Dock은 계속 사용할 수 있습니다."
          location={`${this.props.appId} · ${this.props.windowId}`}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
