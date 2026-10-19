"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ContiWorkspaceAdapter from "@/components/conti/v2/ContiWorkspaceAdapter";

function ContiRouteContent() {
  const searchParams = useSearchParams();
  return (
    <ContiWorkspaceAdapter
      clientId={searchParams.get("clientId") ?? undefined}
      workflowRunId={searchParams.get("workflowRunId") ?? searchParams.get("projectId") ?? undefined}
      resourceId={searchParams.get("resourceId") ?? searchParams.get("stepKey") ?? undefined}
    />
  );
}

export default function ContiPage() {
  return (
    <Suspense fallback={null}>
      <ContiRouteContent />
    </Suspense>
  );
}
