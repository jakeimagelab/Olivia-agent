import { createElement, type ComponentType, type ReactNode } from "react";
import { CalendarDays, Clapperboard, FileText, FolderOpen, Images, Users } from "lucide-react";
import { PhotoWorkspaceWindowContent } from "../adapters/PhotoWorkspaceWindowContent";
import { ClientsWindowContent } from "../adapters/ClientsWindowContent";
import { CalendarWindowContent } from "../adapters/CalendarWindowContent";
import { ComingSoonPlaceholder } from "../adapters/ComingSoonPlaceholder";

// OLIVIA OS Phase 0 App Registry(스펙 0-5) — 앱 실행에 필요한 정보의 중앙 관리 구조. 이번
// Phase에서 실제로 기존 기능을 연결하는 건 customer/calendar/photo-workspace 3개뿐이고(스펙
// 1-12), 나머지 3개는 Desktop Shortcut/Dock에는 노출하되(스펙 1-4/1-5) 내용은
// ComingSoonPlaceholder로 채운다 — 창 자체(생성/드래그/리사이즈/닫기)는 진짜로 동작한다.
export type OliviaAppDefinition = {
  id: string;
  title: string;
  icon: ReactNode;
  route?: string;
  defaultSize: { width: number; height: number };
  minSize?: { width: number; height: number };
  defaultPosition?: { x: number; y: number };
  singleton?: boolean;
  component: ComponentType;
};

export const oliviaAppRegistry: OliviaAppDefinition[] = [
  {
    id: "customer",
    title: "고객관리",
    icon: createElement(Users, { size: 20 }),
    route: "/clients",
    defaultSize: { width: 1100, height: 720 },
    singleton: true,
    component: ClientsWindowContent,
  },
  {
    id: "calendar",
    title: "일정",
    icon: createElement(CalendarDays, { size: 20 }),
    route: "/calendar",
    defaultSize: { width: 1050, height: 700 },
    singleton: true,
    component: CalendarWindowContent,
  },
  {
    id: "photo-workspace",
    title: "사진작업실",
    icon: createElement(Images, { size: 20 }),
    route: "/photo-sorting",
    defaultSize: { width: 1200, height: 760 },
    singleton: true,
    component: PhotoWorkspaceWindowContent,
  },
  {
    id: "quote",
    title: "견적/계약",
    icon: createElement(FileText, { size: 20 }),
    defaultSize: { width: 1000, height: 720 },
    singleton: true,
    component: () => createElement(ComingSoonPlaceholder, { title: "견적/계약" }),
  },
  {
    id: "conti",
    title: "콘티 스튜디오",
    icon: createElement(Clapperboard, { size: 20 }),
    route: "/conti",
    defaultSize: { width: 1100, height: 760 },
    singleton: true,
    component: () => createElement(ComingSoonPlaceholder, { title: "콘티 스튜디오" }),
  },
  {
    id: "documents",
    title: "문서함",
    icon: createElement(FolderOpen, { size: 20 }),
    defaultSize: { width: 1000, height: 700 },
    singleton: true,
    component: () => createElement(ComingSoonPlaceholder, { title: "문서함" }),
  },
];

export function getOliviaApp(appId: string): OliviaAppDefinition | undefined {
  return oliviaAppRegistry.find((app) => app.id === appId);
}
