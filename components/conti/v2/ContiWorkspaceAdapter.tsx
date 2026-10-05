"use client";

import ContiV2App, { type ContiV2AppProps } from "@/components/conti/v2/ContiV2App";

export default function ContiWorkspaceAdapter(props: ContiV2AppProps) {
  // The photo workspace already supplies its own tab strip, panel and guide.
  // Rendering the standalone surface here was what produced the large teal
  // marketing hero inside the "기획" tab.
  return <ContiV2App {...props} surface="workspace" />;
}
