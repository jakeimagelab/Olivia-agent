import { describe, expect, it } from "vitest";

import {
  personSelectDeliveryAssignmentPayload,
  personSelectDeliveryOwnerPayload,
} from "@/components/person-select/admin/hooks/usePersonSelectDeliveryImportController";

describe("person select delivery import controller", () => {
  it("uses a group label for shared projects and a person id for individual projects", () => {
    expect(personSelectDeliveryAssignmentPayload(true, "C1")).toEqual({ groupLabel: "C1" });
    expect(personSelectDeliveryAssignmentPayload(false, "person-1")).toEqual({ personId: "person-1" });
  });

  it("builds reopen and retention payloads without changing the existing API contract", () => {
    expect(personSelectDeliveryOwnerPayload("reopen", "person-1")).toEqual({ action: "reopen", personId: "person-1" });
    expect(personSelectDeliveryOwnerPayload("extend", "person-1")).toEqual({ personId: "person-1" });
  });
});
