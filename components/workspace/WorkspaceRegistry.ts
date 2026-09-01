import type { ComponentType } from "react";
import { Clapperboard, FileSignature, FileText, Wand2, type LucideIcon } from "lucide-react";
import QuoteBuilder from "@/components/quote/QuoteBuilder";
import ContractBuilder from "@/components/contract/ContractBuilder";
import ContiBuilder from "@/components/conti/ContiBuilder";
import PhotoSortingWorkspace from "@/components/photo-classifier/PhotoSortingWorkspace";
import type { WorkspaceType } from "@/lib/store/workspaceStore";

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
  // Olivia 2.0 Phase 1 — 이 워크스페이스를 채팅 없이 직접 열 수 있는 URL 목록. 첫 항목이
  // canonical(URL 동기화 시 쓰는 대표 경로)이다. getWorkspaceTypeForPathname/
  // shouldAutoCloseWorkspace가 이 목록 하나만 보고 판단하므로, 새 direct route를 추가할 땐
  // 여기 한 줄만 늘리면 된다.
  directRoutes: string[];
};

export const workspaceRegistry: Partial<Record<Exclude<WorkspaceType, null>, WorkspaceRegistryEntry>> = {
  quote: { label: "견적서 작성", icon: FileText, component: QuoteBuilder, directRoutes: ["/photoclinic", "/quote"] },
  contract: { label: "계약서 작성", icon: FileSignature, component: ContractBuilder, directRoutes: ["/contract"] },
  conti: { label: "콘티 작성", icon: Clapperboard, component: ContiBuilder, directRoutes: ["/conti"] },
  // photo-sort의 실제 direct route(/photo-sorting)는 PhotoWorkspace(자체 탭/URL 체계를 가진
  // 상위 셸)가 그려서 70/30 스플릿을 쓰지 않는다 — directRoutes는 "이 경로는 등록된
  // 워크스페이스에 속한다"는 판정에만 쓰이고, OliviaWorkspaceShell은 photo-sort일 때 스플릿
  // 렌더를 건너뛴다(components/olivia/OliviaWorkspaceShell.tsx 참고).
  "photo-sort": { label: "사진 분류", icon: Wand2, component: PhotoSortingWorkspace, directRoutes: ["/photo-sorting"] },
  // shoot-prep/calendar/project/gallery/files/analysis: 화면이 생기면 여기 등록.
};

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
