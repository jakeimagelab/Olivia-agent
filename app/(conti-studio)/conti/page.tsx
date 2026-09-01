import { Suspense } from "react";
import OliviaWorkspaceRouteBridge from "@/components/olivia/OliviaWorkspaceRouteBridge";

export default function ContiPage() {
  return (
    <Suspense fallback={null}>
      <OliviaWorkspaceRouteBridge workspaceType="conti" />
    </Suspense>
  );
}
