import { Suspense } from "react";
import OliviaWorkspaceRouteBridge from "@/components/olivia/OliviaWorkspaceRouteBridge";

export default function PhotoclinicPage() {
  return (
    <Suspense fallback={null}>
      <OliviaWorkspaceRouteBridge workspaceType="quote" />
    </Suspense>
  );
}
