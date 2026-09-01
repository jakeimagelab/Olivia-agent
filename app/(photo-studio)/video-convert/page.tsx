import { redirect } from "next/navigation";

export default async function VideoConvertPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const incoming = await searchParams;
  const query = new URLSearchParams({ mode: "conversion" });
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value === "string" && value) query.set(key, value);
  }
  redirect(`/photo-sorting?${query.toString()}`);
}
