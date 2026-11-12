import { PersonSelectHome } from "@/components/person-select/PersonSelectHome";
export default async function Page({ params }: { params: Promise<{ eventSlug: string }> }) { const { eventSlug } = await params; return <PersonSelectHome slug={eventSlug} />; }
