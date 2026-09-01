"use client";

import { useCallback } from "react";
import { useOliviaChatDockStore } from "@/lib/store/useOliviaChatDockStore";

export default function OliviaChatDockTarget({
  id,
  priority,
  className,
}: {
  id: string;
  priority: number;
  className?: string;
}) {
  const setDock = useOliviaChatDockStore((state) => state.setDock);
  const register = useCallback((node: HTMLDivElement | null) => {
    setDock(id, node, priority);
  }, [id, priority, setDock]);

  return <div className={className} ref={register} data-olivia-chat-dock={id} />;
}
