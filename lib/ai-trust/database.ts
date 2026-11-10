export function isGeoRadarSchemaMissing(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  const message = value?.message || String(error || "");
  return value?.code === "42P01" || value?.code === "PGRST205" || /ai_trust_(projects|regions|jobs).*schema cache|relation .*ai_trust_/i.test(message);
}

export function geoRadarSetupResponse(error?: unknown) {
  return {
    ok: false,
    setup_required: true,
    error: "GEO 레이더 스키마 적용이 필요합니다.",
    detail: isGeoRadarSchemaMissing(error) ? "ai_trust 스키마가 아직 없습니다." : undefined,
    apply_order: ["supabase/ai-trust-gap-schema.sql", "supabase/geo-radar-v1.sql"],
  };
}

