import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import { Clapperboard, FileSignature, FileText, Wand2, type LucideIcon } from "lucide-react";
import type { WorkspaceType } from "@/lib/store/workspaceStore";

const loadQuoteBuilder = () => import("@/components/quote/QuoteBuilder");
const loadContractBuilder = () => import("@/components/contract/ContractBuilder");
const loadContiBuilder = () => import("@/components/conti/ContiBuilder");
const loadPhotoWorkspace = () => import("@/components/photo-workspace/PhotoWorkspace");

const QuoteBuilder = dynamic<WorkspaceBuilderProps>(() => loadQuoteBuilder().then((module) => module.default as ComponentType<WorkspaceBuilderProps>));
const ContractBuilder = dynamic<WorkspaceBuilderProps>(() => loadContractBuilder().then((module) => module.default as ComponentType<WorkspaceBuilderProps>));
const ContiBuilder = dynamic<WorkspaceBuilderProps>(() => loadContiBuilder().then((module) => module.default as ComponentType<WorkspaceBuilderProps>));
const PhotoWorkspace = dynamic<WorkspaceBuilderProps>(() => loadPhotoWorkspace().then((module) => module.default as ComponentType<WorkspaceBuilderProps>));

// DynamicWorkspace가 if(type==='quote')/if(type==='contract') 하드코딩 없이 타입 → 컴포넌트를
// 찾도록 하는 레지스트리. 새 워크스페이스(예: shoot-prep)를 연결할 땐 화면 컴포넌트를 만들고
// 여기 한 줄만 추가하면 된다 — DynamicWorkspace.tsx는 그대로 둔다.
export type WorkspaceBuilderProps = {
  mode?: "page" | "modal";
  clientId?: string;
  workflowRunId?: string;
  resourceId?: string;
  startInPreview?: boolean;
  onClose?: () => void;
  onPublished?: () => void;
  registerRequestClose?: (fn: () => void) => void;
};

export type WorkspaceRegistryEntry = {
  label: string;
  icon: LucideIcon;
  component: ComponentType<WorkspaceBuilderProps>;
  preload: () => Promise<unknown>;
  // Olivia 2.0 Phase 1 — 이 워크스페이스를 채팅 없이 직접 열 수 있는 URL 목록. 첫 항목이
  // canonical(URL 동기화 시 쓰는 대표 경로)이다. getWorkspaceTypeForPathname/
  // shouldAutoCloseWorkspace가 이 목록 하나만 보고 판단하므로, 새 direct route를 추가할 땐
  // 여기 한 줄만 늘리면 된다.
  directRoutes: string[];
};

export const workspaceRegistry: Partial<Record<Exclude<WorkspaceType, null>, WorkspaceRegistryEntry>> = {
  // 견적서 원복 요청(2026-09) — /photoclinic, /quote는 QuoteBuilder mode="page"를 직접
  // 렌더링하는 예전 구조로 되돌아갔다(70/30 스플릿에서 제외). directRoutes를 비워두면
  // getWorkspaceTypeForPathname이 이 두 경로를 더 이상 등록된 워크스페이스로 인식하지 않아,
  // OliviaWorkspaceShell도 자동으로 일반 페이지(플로팅 챗)로 취급한다 — quote 타입 자체는
  // 지우지 않았으므로 채팅에서 "견적서 열어줘"처럼 workspace로 띄우는 기능은 그대로 쓸 수 있다.
  quote: { label: "견적서 작성", icon: FileText, component: QuoteBuilder, preload: loadQuoteBuilder, directRoutes: [] },
  contract: { label: "계약서 작성", icon: FileSignature, component: ContractBuilder, preload: loadContractBuilder, directRoutes: ["/contract"] },
  conti: { label: "콘티 작성", icon: Clapperboard, component: ContiBuilder, preload: loadContiBuilder, directRoutes: ["/conti"] },
  // photo-sort의 실제 direct route(/photo-sorting)는 PhotoWorkspace(자체 탭/URL 체계를 가진
  // 상위 셸)가 그려서 70/30 스플릿을 쓰지 않는다 — directRoutes는 "이 경로는 등록된
  // 워크스페이스에 속한다"는 판정에만 쓰이고, OliviaWorkspaceShell은 photo-sort일 때 스플릿
  // 렌더를 건너뛴다(components/olivia/OliviaWorkspaceShell.tsx 참고).
  "photo-sort": { label: "사진 작업실", icon: Wand2, component: PhotoWorkspace, preload: loadPhotoWorkspace, directRoutes: ["/photo-sorting"] },
  // shoot-prep/calendar/project/gallery/files/analysis: 화면이 생기면 여기 등록.
};

export function preloadWorkspace(type: Exclude<WorkspaceType, null>) {
  return workspaceRegistry[type]?.preload();
}

function matchesDirectRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

// 어떤 pathname이 등록된 워크스페이스의 direct route인지 판정하는 단일 진실 공급원.
// OliviaWorkspaceShell(스플릿 렌더 여부)과 shouldAutoCloseWorkspace(자동 닫기 여부)가
// 둘 다 이 함수 하나만 보고 판단한다.
export function getWorkspaceTypeForPathname(pathname?: string | null): Exclude<WorkspaceType, null> | undefined {
  if (!pathname) return undefined;
  for (const [type, entry] of Object.entries(workspaceRegistry) as Array<[Exclude<WorkspaceType, null>, WorkspaceRegistryEntry]>) {
    if (entry.directRoutes.some((route) => matchesDirectRoute(pathname, route))) return type;
  }
  return undefined;
}

// route bridge(URL 진입)로 열린 워크스페이스만 자동으로 닫는다 — 채팅/카드로 연 워크스페이스는
// 사용자가 명시적으로 요청한 것이라 페이지 이동만으로 놀라게 닫지 않는다(설계 문서 §9).
export function shouldAutoCloseWorkspace(input: {
  type: Exclude<WorkspaceType, null> | null | undefined;
  openedBy?: string;
  pathname?: string | null;
}): boolean {
  if (!input.type || input.openedBy !== "route") return false;
  const entry = workspaceRegistry[input.type];
  if (!entry || !input.pathname) return true;
  return !entry.directRoutes.some((route) => matchesDirectRoute(input.pathname as string, route));
}
