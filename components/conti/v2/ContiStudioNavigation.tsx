"use client";

import { usePathname } from "next/navigation";
import { Camera, Film } from "lucide-react";
import SegmentedTabs from "@/components/ui/SegmentedTabs";

type ContiStudioTab = "photo" | "video";

export default function ContiStudioNavigation() {
  const pathname = usePathname();
  const value: ContiStudioTab = pathname.startsWith("/video-conti") ? "video" : "photo";

  return (
    <div style={{ width: "100%", overflowX: "auto", padding: "14px clamp(16px, 2.2vw, 32px) 0" }}>
      <SegmentedTabs
        ariaLabel="콘티 종류"
        value={value}
        onChange={() => undefined}
        items={[
          { value: "photo", label: "촬영 콘티", href: "/conti", icon: <Camera size={15} strokeWidth={2} aria-hidden="true" /> },
          { value: "video", label: "영상 콘티", href: "/video-conti", icon: <Film size={15} strokeWidth={2} aria-hidden="true" /> },
        ]}
      />
    </div>
  );
}
