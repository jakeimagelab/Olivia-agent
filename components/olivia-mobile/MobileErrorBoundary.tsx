"use client";

import { Component, type ReactNode } from "react";

const CHUNK_ERROR_PATTERN = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i;
const RELOAD_GUARD_KEY = "oliviaMobileChunkReloadAttempted";

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "ChunkLoadError" || CHUNK_ERROR_PATTERN.test(error.message);
}

type Props = { onGoHome: () => void; children: ReactNode };
type State = { hasError: boolean };

// 사진작업실처럼 next/dynamic을 여러 단으로 겹쳐 쓰는 화면은 모바일의 불안정한 네트워크에서
// 청크 로드가 가끔 실패한다(ChunkLoadError). OliviaMobileShell 트리 전체에 에러 바운더리가
// 하나도 없어서 그대로 Next.js 기본 "Application error" 화면까지 튕겨나가 모바일 세션 전체가
// 끊기는 문제가 있었다 — 여기서 화면 하나만 잡아 복구할 수 있게 한다(데스크톱 OS 창 시스템의
// AppWindowErrorBoundary와 같은 패턴, 새 프레임워크 아님).
export class MobileErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[olivia-mobile] screen crashed:", error);
    if (isChunkLoadError(error) && typeof window !== "undefined") {
      // 청크 로드 실패는 "다시 시도" 버튼으로 못 고친다 — 브라우저가 들고 있는 매니페스트가
      // 이미 오래됐기 때문이다. 새로고침 한 번으로 최신 청크를 다시 받아온다. 네트워크가
      // 아예 끊긴 경우까지 무한 새로고침하지 않도록 세션당 한 번만 시도한다.
      try {
        if (!window.sessionStorage.getItem(RELOAD_GUARD_KEY)) {
          window.sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
          window.location.reload();
        }
      } catch {
        // sessionStorage 접근 자체가 막힌 환경(프라이빗 모드 등)이면 자동 새로고침은 건너뛰고
        // 아래 재시도/홈 버튼으로만 복구하게 둔다.
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 14, height: "100%", padding: 24, textAlign: "center", background: "#f7fbfa",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#17332e" }}>화면을 불러오지 못했어요.</div>
          <div style={{ fontSize: 12, color: "#718580" }}>네트워크 상태를 확인하고 다시 시도해주세요.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              style={{
                padding: "9px 18px", borderRadius: 10, border: "1.5px solid rgba(21,88,85,.2)",
                background: "#eef7f5", color: "#155855", fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              다시 시도
            </button>
            <button
              type="button"
              onClick={() => { this.setState({ hasError: false }); this.props.onGoHome(); }}
              style={{
                padding: "9px 18px", borderRadius: 10, border: "1.5px solid rgba(0,0,0,.1)",
                background: "#fff", color: "#17332e", fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              홈으로
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
