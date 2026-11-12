"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPhotoDepartmentContext } from "@/lib/photo-classifier/departmentContextClient";
import {
  manualPhotoDepartmentResolution,
  type PhotoDepartmentResolution,
} from "@/lib/photo-classifier/departmentResolver";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

export function photoDepartmentContextKey({
  clientId,
  workflowRunId,
  folderName,
}: {
  clientId: string;
  workflowRunId: string;
  folderName: string;
}) {
  return `${clientId}:${workflowRunId}:${folderName}`;
}

export function usePhotoDepartmentContext({
  enabled,
  clientId,
  workflowRunId,
  folderName,
  setDepartment,
  setResolution,
}: {
  enabled: boolean;
  clientId: string;
  workflowRunId: string;
  folderName: string;
  setDepartment: (department: MedicalDepartment) => void;
  setResolution: (resolution: PhotoDepartmentResolution) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const contextKeyRef = useRef("");

  const requestPicker = useCallback(() => setPickerOpen(true), []);
  const chooseDepartment = useCallback((department: MedicalDepartment) => {
    setDepartment(department);
    setResolution(manualPhotoDepartmentResolution(department));
    setError("");
    setPickerOpen(false);
  }, [setDepartment, setResolution]);

  useEffect(() => {
    if (!enabled || !folderName) return;
    const contextKey = photoDepartmentContextKey({ clientId, workflowRunId, folderName });
    if (contextKeyRef.current === contextKey) return;
    contextKeyRef.current = contextKey;

    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetchPhotoDepartmentContext({ clientId, workflowRunId, folderName }, { signal: controller.signal })
      .then((resolution) => {
        if (controller.signal.aborted) return;
        setResolution(resolution);
        if (resolution.status === "resolved") {
          setDepartment(resolution.department);
          setPickerOpen(false);
        } else {
          setPickerOpen(true);
        }
      })
      .catch((caughtError) => {
        if (controller.signal.aborted) return;
        setResolution({ status: "unknown", evidence: [] });
        setPickerOpen(true);
        setError(caughtError instanceof Error ? caughtError.message : "진료과 정보를 확인하지 못했습니다.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [
    clientId,
    enabled,
    folderName,
    setDepartment,
    setResolution,
    workflowRunId,
  ]);

  return {
    chooseDepartment,
    contextKeyRef,
    error,
    loading,
    pickerOpen,
    requestPicker,
    setError,
    setPickerOpen,
  };
}
