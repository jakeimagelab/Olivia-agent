import { PersonSelectDone } from "@/components/person-select/PersonSelectDone";
export default async function Page({ params }: { params: Promise<{ eventSlug: string }> }) { const { eventSlug } = await params; return <PersonSelectDone slug={eventSlug} />; }
