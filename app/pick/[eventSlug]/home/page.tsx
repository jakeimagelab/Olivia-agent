import { PersonSelectHome } from "@/components/person-select/PersonSelectPublic";
export default async function Page({ params }: { params: Promise<{ eventSlug: string }> }) { const { eventSlug } = await params; return <PersonSelectHome slug={eventSlug} />; }
