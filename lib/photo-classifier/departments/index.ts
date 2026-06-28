import type { DepartmentClassificationConfig, MedicalDepartment } from "../types";
import { dermatologyConfig } from "./dermatology";
import { generalConfig } from "./general";

const departmentRegistry: Partial<Record<MedicalDepartment, DepartmentClassificationConfig>> = {
  dermatology: dermatologyConfig,
  general: generalConfig,
};

export function getDepartmentConfig(
  department: MedicalDepartment
): DepartmentClassificationConfig {
  return departmentRegistry[department] ?? generalConfig;
}

export { dermatologyConfig, generalConfig };
