import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import DocumentPortalWorkspace from "@/components/document-mail/DocumentPortalWorkspace";
import { isPcrmUuid } from "@/lib/pcrm/validation";

export const dynamic = "force-dynamic";

export default async function TransactionStatementMailPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await cookies()).get("pc_admin_session")?.value !== "active") redirect("/");
  const { id } = await params;
  if (!isPcrmUuid(id)) notFound();
  return <DocumentPortalWorkspace target={{ anchor: { kind: "statement", id }, tab: "statement" }} />;
}
