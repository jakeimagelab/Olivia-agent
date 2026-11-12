import { describe, expect, it } from "vitest";
import { getNormalizablePinPeople, type PinListPerson } from "@/components/person-select/admin/PinListDialog";

const person = (patch: Partial<PinListPerson>): PinListPerson => ({
  id: "person-1",
  displayName: "정연호 대표님",
  loginName: "정연호대표님",
  suggestedLoginName: "정연호",
  canAutoNormalize: true,
  groupLabel: "정연호 대표님",
  pin: "1234",
  ...patch,
});

describe("person select PIN list", () => {
  it("returns only people whose login names can be normalized", () => {
    const result = getNormalizablePinPeople([
      person({ id: "change" }),
      person({ id: "same", loginName: "정연호" }),
      person({ id: "manual", canAutoNormalize: false }),
    ]);

    expect(result.map((item) => item.id)).toEqual(["change"]);
  });
});
