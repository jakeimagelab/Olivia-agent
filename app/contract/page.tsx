import { Suspense } from "react";
import DocumentPortalWorkspace from "@/components/document-mail/DocumentPortalWorkspace";
import OliviaWorkspaceRouteBridge from "@/components/olivia/OliviaWorkspaceRouteBridge";
import { readDocumentPortalTarget } from "@/lib/document-mail/portal";

export default async function ContractPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const target = readDocumentPortalTarget("contract", { get: (key) => params[key] ?? null });
  if (target) return <DocumentPortalWorkspace target={target} />;
  return (
    <Suspense fallback={null}>
      <OliviaWorkspaceRouteBridge workspaceType="contract" />
    </Suspense>
  );
}
