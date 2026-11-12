"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  customerBridgeFolderTree,
  customerBridgeFolderView,
  type CustomerBridgeFolderImage,
} from "@/lib/select-gallery/customerBridge";
import type { CustomerBridgeFolderManifest } from "@/lib/select-gallery/customerBridgeTypes";

export type CustomerBridgeLocation =
  | { kind: "root" }
  | { kind: "all" }
  | { kind: "folder"; path: string };

const EMPTY_FOLDERS: never[] = [];

export function customerBridgeLocationStorageValue(location: CustomerBridgeLocation) {
  return location.kind === "folder" ? `folder:${location.path}` : location.kind;
}

export function restoreCustomerBridgeLocation(
  value: string | null,
  folderPaths: ReadonlySet<string>,
): CustomerBridgeLocation {
  if (value === "all") return { kind: "all" };
  if (value?.startsWith("folder:")) {
    const path = value.slice(7);
    if (path === "" || folderPaths.has(path)) return { kind: "folder", path };
  }
  return { kind: "root" };
}

export function customerBridgeParentLocation(location: CustomerBridgeLocation): CustomerBridgeLocation {
  if (location.kind !== "folder") return { kind: "root" };
  const parent = location.path.split("/").slice(0, -1).join("/");
  return parent ? { kind: "folder", path: parent } : { kind: "root" };
}

export function customerBridgeLocationImages<T extends CustomerBridgeFolderImage>(
  images: readonly T[],
  location: CustomerBridgeLocation,
) {
  if (location.kind === "all") return [...images];
  if (location.kind === "folder") return customerBridgeFolderView(images, location.path).images;
  return [];
}

export function useCustomerBridgeLocation<T extends CustomerBridgeFolderImage>({
  images,
  manifest,
  storageScope,
  onLocationOpened,
  onStorageError,
}: {
  images: readonly T[];
  manifest?: CustomerBridgeFolderManifest | null;
  storageScope: string;
  onLocationOpened: (images: readonly T[]) => void;
  onStorageError?: (scope: string, error: unknown) => void;
}) {
  const [location, setLocation] = useState<CustomerBridgeLocation>({ kind: "root" });
  const [locationReady, setLocationReady] = useState(false);
  const onLocationOpenedRef = useRef(onLocationOpened);
  onLocationOpenedRef.current = onLocationOpened;

  const folderTree = useMemo(() => customerBridgeFolderTree(images, manifest), [images, manifest]);
  const folderPaths = useMemo(() => new Set(folderTree.map((folder) => folder.path)), [folderTree]);
  const rootView = useMemo(() => customerBridgeFolderView(images, "", manifest), [images, manifest]);
  const folderView = useMemo(
    () => location.kind === "folder" ? customerBridgeFolderView(images, location.path, manifest) : null,
    [images, location, manifest],
  );
  const folderImages = useMemo(
    () => location.kind === "all" ? [...images] : location.kind === "folder" ? folderView?.images ?? [] : [],
    [folderView, images, location.kind],
  );
  const childFolders = location.kind === "root" ? rootView.folders : folderView?.folders ?? EMPTY_FOLDERS;
  const locationTotalCount = location.kind === "all"
    ? manifest?.totalCount ?? images.length
    : location.kind === "folder"
      ? location.path
        ? manifest?.folders.find((folder) => folder.path === location.path)?.directCount ?? folderImages.length
        : manifest?.rootPhotoCount ?? folderImages.length
      : manifest?.totalCount ?? images.length;

  useEffect(() => {
    if (locationReady) return;
    try {
      setLocation(restoreCustomerBridgeLocation(
        sessionStorage.getItem(`customer-bridge-location:${storageScope}`),
        folderPaths,
      ));
    } catch (error) {
      onStorageError?.("location-restore", error);
    } finally {
      setLocationReady(true);
    }
  }, [folderPaths, locationReady, onStorageError, storageScope]);

  useEffect(() => {
    if (!locationReady) return;
    try {
      sessionStorage.setItem(
        `customer-bridge-location:${storageScope}`,
        customerBridgeLocationStorageValue(location),
      );
    } catch (error) {
      onStorageError?.("location-save", error);
    }
  }, [location, locationReady, onStorageError, storageScope]);

  const openLocation = useCallback((nextLocation: CustomerBridgeLocation) => {
    setLocation(nextLocation);
    onLocationOpenedRef.current(customerBridgeLocationImages(images, nextLocation));
  }, [images]);

  const goToParentFolder = useCallback(() => {
    if (location.kind === "root") return;
    openLocation(customerBridgeParentLocation(location));
  }, [location, openLocation]);

  return {
    location,
    folderTree,
    rootView,
    folderView,
    folderImages,
    childFolders,
    locationTotalCount,
    openLocation,
    goToParentFolder,
  };
}
