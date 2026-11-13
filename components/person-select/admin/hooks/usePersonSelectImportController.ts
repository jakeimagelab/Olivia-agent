"use client";

import { useState } from "react";

import { usePersonSelectDeliveryImportController } from "@/components/person-select/admin/hooks/usePersonSelectDeliveryImportController";
import {
  usePersonSelectOriginalImportController,
  type PersonSelectSourceMode,
} from "@/components/person-select/admin/hooks/usePersonSelectOriginalImportController";
import type { PersonSelectImportLayout } from "@/lib/person-select/localImport";

export type { PersonSelectSourceMode };
export type PersonSelectUploadKind = "original" | "delivery";

export function usePersonSelectImportController({
  eventId,
  projectTitle,
  layout,
  isShared,
  load,
  onOriginalImportComplete,
  setMessage,
}: {
  eventId: string;
  projectTitle: string;
  layout: PersonSelectImportLayout;
  isShared: boolean;
  load: () => Promise<void>;
  onOriginalImportComplete: () => void;
  setMessage: (message: string) => void;
}) {
  const [uploadKind, setUploadKind] = useState<PersonSelectUploadKind>("original");
  const originalController = usePersonSelectOriginalImportController({
    eventId,
    projectTitle,
    layout,
    load,
    onComplete: onOriginalImportComplete,
    setMessage,
  });
  const deliveryController = usePersonSelectDeliveryImportController({
    eventId,
    isShared,
    path: originalController.path,
    load,
    setMessage,
  });

  return {
    ...originalController,
    uploadKind,
    setUploadKind,
    deliveryJobId: deliveryController.deliveryJobId,
    deliveryResult: deliveryController.deliveryResult,
    deliveryAssignments: deliveryController.deliveryAssignments,
    startDeliveryImport: deliveryController.startDeliveryImport,
    assignDelivery: deliveryController.assignDelivery,
    changeDeliveryOwner: deliveryController.changeDeliveryOwner,
    updateDeliveryAssignment: deliveryController.updateDeliveryAssignment,
  };
}
