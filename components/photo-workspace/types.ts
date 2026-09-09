export type PhotoWorkspaceMode = "select" | "metadata-select" | "raw-match" | "classification" | "retouch";
export type PhotoSelectMode = "ai" | "manual" | "client";
// "AI 컷 정리 / RAW 매칭" 탭 안의 서브 토글 — 2026-09-10 수정 지시서 2번. 두 도구
// (raw-select 페이지의 AI 자동 컷 정리, 기존 SelectMatchWorkspace의 RAW 파일 매칭)를
// 한 탭에 묶되 컴포넌트는 그대로 재사용한다.
export type RawMatchView = "ai-cull" | "match";
