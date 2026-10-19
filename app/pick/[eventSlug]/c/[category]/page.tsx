import { PersonSelectCategory } from "@/components/person-select/PersonSelectPublic";
export default async function Page({ params }: { params: Promise<{ eventSlug: string; category: string }> }) { const { eventSlug, category } = await params; return <PersonSelectCategory slug={eventSlug} categoryKey={category} />; }
