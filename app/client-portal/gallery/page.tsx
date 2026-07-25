"use client";

import { useEffect, useState } from "react";
import { GalleryWorkspace } from "../_components/gallery/GalleryWorkspace";
import { PortalError, PortalLoading, PortalPageShell } from "../_components/PortalShell";
import { usePortalSession } from "../_hooks/usePortalSession";

export default function PortalGalleryPage() {
  const { session, loading, error, token } = usePortalSession();
  const [workspace, setWorkspace] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  const load = async () => {
    if (!token) return;
    setDataError("");
    try {
      const response = await fetch("/api/client-portal/gallery-workspace", {
        headers: { "x-portal-token": token },
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "갤러리를 불러오지 못했습니다.");
      setWorkspace(payload.workspace);
    } catch (loadError) {
      setDataError(loadError instanceof Error ? loadError.message : "갤러리를 불러오지 못했습니다.");
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && token) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, token]);

  if (loading || dataLoading) return <PortalLoading />;
  if (error || dataError) return <PortalError message={error || dataError} />;
  if (!session) return <PortalError message="세션 정보를 불러올 수 없습니다." />;

  return (
    <PortalPageShell session={session} active="갤러리">
      <GalleryWorkspace workspace={workspace} token={token} onRefresh={load} />
    </PortalPageShell>
  );
}
