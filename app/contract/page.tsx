import { Suspense } from "react";
import OliviaWorkspaceRouteBridge from "@/components/olivia/OliviaWorkspaceRouteBridge";

export default function ContractPage() {
  return (
    <Suspense fallback={null}>
      <OliviaWorkspaceRouteBridge workspaceType="contract" />
    </Suspense>
  );
}
