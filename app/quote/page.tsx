import QuoteBuilder from "@/components/quote/QuoteBuilder";
import DocumentPortalWorkspace from "@/components/document-mail/DocumentPortalWorkspace";
import { readDocumentPortalTarget } from "@/lib/document-mail/portal";

export default async function Quote({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const target = readDocumentPortalTarget("quote", { get: (key) => params[key] ?? null });
  if (target) return <DocumentPortalWorkspace target={target} />;
  return <QuoteBuilder resourceId={params.resourceId || params.id} />;
}
