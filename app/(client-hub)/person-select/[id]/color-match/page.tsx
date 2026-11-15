import { ColorMatchEditor } from "@/components/person-select/color-match/ColorMatchEditor";

export default async function PersonSelectColorMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ColorMatchEditor eventId={id} />;
}
