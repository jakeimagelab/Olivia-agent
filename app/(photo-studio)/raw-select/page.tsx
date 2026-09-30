import { redirect } from "next/navigation";

/**
 * The former route mixed JPG failure-cutting, RAW source selection, scene naming,
 * reports, and RAW transfer. Keep the old public address working, but send it
 * to the one-purpose T컷 screen instead of rendering that combined workflow.
 */
export default function LegacyRawSelectPage() {
  redirect("/photo-sorting?mode=t-cut");
}
