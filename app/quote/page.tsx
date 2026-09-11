import QuoteBuilder from "@/components/quote/QuoteBuilder";

export default async function Quote({ searchParams }: { searchParams: Promise<{ resourceId?: string; id?: string }> }) {
  const params = await searchParams;
  return <QuoteBuilder resourceId={params.resourceId || params.id} />;
}
