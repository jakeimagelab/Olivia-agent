import { redirect } from "next/navigation";

export default async function PersonSelectColorMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/photo-retouching?tab=edit&event_id=${encodeURIComponent(id)}`);
}
