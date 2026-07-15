import { notFound, redirect } from "next/navigation";

const TOOL_ROUTES: Record<string, string> = {
  quote: "/quote",
  contract: "/contract",
  conti: "/conti",
  "photo-sorting": "/photo-sorting",
  "select-galleries": "/select-galleries",
  "raw-matching": "/select-match",
  retouching: "/photo-retouching",
  "seo-delivery": "/seo-delivery",
  reviews: "/review-studio",
  rewards: "/per",
  content: "/sns-manager",
};

const CONTEXT_KEYS = ["clientId", "projectId", "workflowRunId", "stepKey"] as const;

export default async function AdminToolRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ tool: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tool } = await params;
  const target = TOOL_ROUTES[tool];
  if (!target) notFound();

  const incoming = await searchParams;
  const query = new URLSearchParams();
  for (const key of CONTEXT_KEYS) {
    const value = incoming[key];
    if (typeof value === "string" && value) query.set(key, value);
  }
  redirect(query.size ? `${target}?${query.toString()}` : target);
}
