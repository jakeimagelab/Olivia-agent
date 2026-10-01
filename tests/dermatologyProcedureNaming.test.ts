import { describe, expect, it } from "vitest";
import {
  resolveDermatologyProcedure,
  type DermatologyProcedureEvidence,
} from "@/lib/photo-classifier/departments/dermatologyEquipment";

function treatment(overrides: Partial<DermatologyProcedureEvidence> = {}): DermatologyProcedureEvidence {
  return {
    sceneType: "treatment",
    confidence: 0.9,
    hasDoctor: true,
    hasPatient: true,
    equipmentPresent: true,
    procedureActionConfirmed: true,
    ...overrides,
  };
}

describe("dermatology Scene procedure naming", () => {
  it("votes repeated Ultherapy equipment and handpiece evidence into 울쎄라시술", () => {
    const result = resolveDermatologyProcedure([
      treatment({ equipmentName: "Ultherapy", handpieceName: "Ultherapy transducer", procedureConfidence: 0.82 }),
      treatment({ equipmentName: "Ultherapy", procedureConfidence: 0.94 }),
      treatment({ procedureName: "울쎄라", procedureConfidence: 0.91 }),
      treatment({ procedureConfidence: 0.3 }),
    ]);
    expect(result).toMatchObject({ label: "울쎄라시술", procedureName: "울쎄라" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("names a following Thermage Scene separately", () => {
    expect(resolveDermatologyProcedure([treatment({ equipmentName: "Thermage FLX", procedureConfidence: 0.93 })]))
      .toMatchObject({ label: "써마지시술", procedureName: "써마지" });
  });

  it("uses 주사시술 only when doctor, patient, syringe, and action are all confirmed", () => {
    expect(resolveDermatologyProcedure([treatment({ syringePresent: true, procedureActionConfirmed: true, equipmentPresent: false })]))
      .toMatchObject({ label: "주사시술" });
    expect(resolveDermatologyProcedure([treatment({ syringePresent: true, procedureActionConfirmed: false, equipmentPresent: false })]))
      .not.toMatchObject({ label: "주사시술" });
  });

  it("uses the lifting category when exact device confidence is insufficient", () => {
    expect(resolveDermatologyProcedure([treatment({ equipmentCategory: "lifting_device", handpiecePresent: true, procedureConfidence: 0.67 })]))
      .toMatchObject({ label: "리프팅시술", procedureName: "리프팅" });
  });

  it("does not leave confirmed treatment action as 미분류", () => {
    expect(resolveDermatologyProcedure([treatment({ equipmentCategory: "unknown", equipmentPresent: true, procedureConfidence: 0.42 })]))
      .toMatchObject({ label: "장비시술" });
  });

  it("keeps doctor consultation distinct from treatment", () => {
    expect(resolveDermatologyProcedure([{
      sceneType: "consultation", confidence: 0.91, hasDoctor: true, hasPatient: true, consultationDeskPresent: true,
    }])).toMatchObject({ label: "원장상담" });
  });

  it("uses LDM관리 for skin-care equipment", () => {
    expect(resolveDermatologyProcedure([{
      sceneType: "skin_care", confidence: 0.9, equipmentPresent: true, equipmentName: "LDM water", procedureConfidence: 0.9,
    }])).toMatchObject({ label: "LDM관리", procedureName: "LDM" });
  });

  it("keeps different devices in separately split Scenes differently named", () => {
    const ultherapy = resolveDermatologyProcedure([treatment({ equipmentName: "Ultherapy", procedureConfidence: 0.95 })]);
    const thermage = resolveDermatologyProcedure([treatment({ equipmentName: "Thermage", procedureConfidence: 0.95 })]);
    expect(ultherapy.label).not.toBe(thermage.label);
  });

  it("does not create a new procedure just because angles differ", () => {
    const result = resolveDermatologyProcedure([
      treatment({ equipmentName: "InMode", procedureConfidence: 0.9, namingEvidence: ["본체 정면"] }),
      treatment({ equipmentName: "InMode", procedureConfidence: 0.88, namingEvidence: ["핸드피스 클로즈업"] }),
    ]);
    expect(result).toMatchObject({ label: "인모드시술" });
  });

  it("does not guess an exact device below the exact-name threshold", () => {
    expect(resolveDermatologyProcedure([treatment({ equipmentName: "Ultherapy", equipmentCategory: "lifting_device", procedureConfidence: 0.42 })]))
      .toMatchObject({ label: "장비시술", procedureName: "장비" });
  });
});
