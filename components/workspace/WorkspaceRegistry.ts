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
};

export const workspaceRegistry: Partial<Record<Exclude<WorkspaceType, null>, WorkspaceRegistryEntry>> = {
  quote: { label: "견적서 작성", icon: FileText, component: QuoteBuilder },
  contract: { label: "계약서 작성", icon: FileSignature, component: ContractBuilder },
  conti: { label: "콘티 작성", icon: Clapperboard, component: ContiBuilder },
  "photo-sort": { label: "사진 분류", icon: Wand2, component: PhotoSortingWorkspace },
  // shoot-prep/calendar/project/gallery/files/analysis: 화면이 생기면 여기 등록.
};
