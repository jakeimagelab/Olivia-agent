import { PersonSelectLogin } from "@/components/person-select/PersonSelectPublic";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const { data: event } = await getSupabaseAdmin()
    .from("person_select_events")
    .select("title,slug,deadline_at,status")
    .eq("slug", eventSlug)
    .maybeSingle();
  return <PersonSelectLogin slug={eventSlug} event={event} />;
}
