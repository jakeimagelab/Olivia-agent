"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { OliviaErrorView } from "@/components/errors/OliviaErrorView";
import { logOliviaError } from "@/lib/errors/errorDiagnostics";

type Props = { children: ReactNode };
type State = { error: unknown | null };

export class DesktopShellErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    logOliviaError("desktop-shell", error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <OliviaErrorView
          error={this.state.error}
          title="데스크톱 화면을 불러오지 못했습니다."
          description="데스크톱 셸에서 오류가 발생했습니다. 오류 원문을 확인한 뒤 다시 시도해 주세요."
          location="OliviaDesktop"
          onRetry={() => this.setState({ error: null })}
          onGoHome={() => { window.location.href = "/"; }}
        />
      );
    }
    return this.props.children;
  }
}
