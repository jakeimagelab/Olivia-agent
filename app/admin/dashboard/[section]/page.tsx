import { notFound, redirect } from "next/navigation";

const LEGACY_ROUTES: Record<string, string> = {
  consultations: "/consultation",
  calendar: "/calendar",
  mailing: "/mailing",
  links: "/link-generator",
  trash: "/trash",
};

export default async function DashboardSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const target = LEGACY_ROUTES[section];
  if (!target) notFound();
  redirect(target);
}
