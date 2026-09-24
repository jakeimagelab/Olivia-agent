import { redirect } from "next/navigation";
import { buildClientOliviaRootHref, type ClientRouteSearchParams } from "@/lib/olivia/navigation/clientRoute";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<ClientRouteSearchParams>;
}) {
  redirect(buildClientOliviaRootHref(await searchParams));
}
