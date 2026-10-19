"use client";

import ContiV2App, { type ContiV2AppProps } from "@/components/conti/v2/ContiV2App";

export default function ContiWorkspaceAdapter(props: ContiV2AppProps) {
  // 독립 라우트와 Olivia OS 창은 같은 밝은 작성 화면을 쓰며, 예전 대형 히어로는 복원하지 않는다.
  return <ContiV2App {...props} surface="workspace" />;
}
