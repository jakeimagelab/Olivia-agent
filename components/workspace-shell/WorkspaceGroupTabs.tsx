"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import SegmentedTabs, { type SegmentedTabsItem } from "@/components/ui/SegmentedTabs";
import { useAnalysisHost } from "@/components/analysis-workspace/AnalysisHostContext";
import { useDesktopAppLauncher } from "@/components/olivia-os/useDesktopAppLauncher";
import { useDesktopWindowMode } from "@/lib/desktopWindowContext";
import {
  getWorkspaceGroup,
  resolveWorkspaceGroupForLocation,
  type WorkspaceGroupId,
} from "@/lib/workspaceGroups";

export type WorkspaceGroupTabsProps = {
  groupId?: WorkspaceGroupId;
  activeToolId?: string;
};

const NAV_STYLE = {
  width: "100%",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px clamp(12px, 2vw, 24px)",
  borderBottom: "1px solid rgba(21, 88, 85, .1)",
  background: "#FDFCF9",
  overflow: "hidden",
} as const;

const GROUP_LABEL_STYLE = {
  flex: "0 0 auto",
  color: "#5A7470",
  fontSize: 11.5,
  fontWeight: 500,
  whiteSpace: "nowrap",
} as const;

const TABS_STYLE = { minWidth: 0, maxWidth: "100%" } as const;

function preserveEmbeddedMode(href: string): string {
  const target = new URL(href, "https://olivia.local");
  target.searchParams.set("oliviaEmbedded", "1");
  return `${target.pathname}${target.search}`;
}

function WorkspaceGroupTabsContent({ groupId, activeToolId }: WorkspaceGroupTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const desktopWindowMode = useDesktopWindowMode();
  const { surface } = useAnalysisHost();
  const launchDesktopApp = useDesktopAppLauncher();
  const resolved = resolveWorkspaceGroupForLocation(pathname, searchParams.toString());
  const group = groupId ? getWorkspaceGroup(groupId) : resolved?.group;

  if (!group || group.id === "photo" || group.id === "video") return null;

  const selectedToolId = activeToolId
    ?? (resolved?.group.id === group.id ? resolved.activeToolId : undefined)
    ?? group.tools[0]?.id
    ?? "";
  const nativeWindow = desktopWindowMode || surface === "window";
  const embedded = searchParams.get("oliviaEmbedded") === "1";
  const items: SegmentedTabsItem<string>[] = group.tools.map((tool) => ({
    value: tool.id,
    label: tool.title,
    href: nativeWindow || tool.id === selectedToolId
      ? undefined
      : embedded
        ? preserveEmbeddedMode(tool.href)
        : tool.href,
  }));

  return (
    <nav
      aria-label={`${group.title} 기능`}
      data-workspace-group-tabs={group.id}
      style={NAV_STYLE}
    >
      <span style={GROUP_LABEL_STYLE}>
        {group.title}
      </span>
      <SegmentedTabs
        ariaLabel={`${group.title} 하위 기능`}
        value={selectedToolId}
        items={items}
        onChange={(nextToolId) => {
          if (nextToolId === selectedToolId) return;
          const nextTool = group.tools.find((tool) => tool.id === nextToolId);
          if (nativeWindow && nextTool) launchDesktopApp(nextTool.href, nextTool.title);
        }}
        style={TABS_STYLE}
      />
    </nav>
  );
}

export default function WorkspaceGroupTabs(props: WorkspaceGroupTabsProps) {
  return (
    <Suspense fallback={null}>
      <WorkspaceGroupTabsContent {...props} />
    </Suspense>
  );
}
