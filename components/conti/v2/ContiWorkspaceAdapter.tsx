"use client";

import ContiV2App, { type ContiV2AppProps } from "@/components/conti/v2/ContiV2App";

export default function ContiWorkspaceAdapter(props: ContiV2AppProps) {
  return <ContiV2App {...props} />;
}
