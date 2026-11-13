"use client";

import { useRef } from "react";

import type { OliviaBridgeFolderLoadingBindings } from "@/components/olivia-bridge/oliviaBridgeFolderLoadingTypes";
import { useOliviaBridgeLocalFolderLoading } from "@/components/olivia-bridge/useOliviaBridgeLocalFolderLoading";
import { useOliviaBridgeRemoteFolderLoading } from "@/components/olivia-bridge/useOliviaBridgeRemoteFolderLoading";

export function useOliviaBridgeFolderLoading(bindings: OliviaBridgeFolderLoadingBindings) {
  const loadGenerationRef = useRef(0);
  const loadDirectory = useOliviaBridgeLocalFolderLoading(bindings, loadGenerationRef);
  const loadRemoteDirectory = useOliviaBridgeRemoteFolderLoading(bindings, loadGenerationRef);
  return { loadDirectory, loadRemoteDirectory };
}
