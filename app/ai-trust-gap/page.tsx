import { redirect } from "next/navigation";

export default async function AiTrustGapRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value) query.set(key, value);
  });
  redirect(`/geo-radar${query.size ? `?${query.toString()}` : ""}`);
}
