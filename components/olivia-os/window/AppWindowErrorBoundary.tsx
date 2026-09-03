"use client";

import { Component, type ReactNode } from "react";

// 스펙 1-28 — 특정 App Window가 crash해도 전체 Desktop이 죽지 않게 한다. React 에러 바운더리는
// 클래스 컴포넌트로만 만들 수 있다(hook으로 대체 불가).
type Props = { appTitle: string; children: ReactNode };
type State = { hasError: boolean };

export class AppWindowErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[olivia-os] app window crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, height: "100%", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2B28" }}>{this.props.appTitle}을(를) 불러오지 못했습니다.</div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid rgba(21,88,85,.2)", background: "#EAF4F2", color: "#155855", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            다시 열기
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
