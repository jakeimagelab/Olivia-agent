import type { DepartmentClassificationConfig, MedicalDepartment } from "../types";
import { dermatologyConfig }            from "./dermatology";
import { orthopedicsNeurosurgeryConfig } from "./orthopedics-neurosurgery";
import { dentistryConfig }              from "./dentistry";
import { plasticSurgeryConfig }         from "./plastic-surgery";
import { generalConfig }                from "./general";

const departmentRegistry: Partial<Record<MedicalDepartment, DepartmentClassificationConfig>> = {
  dermatology:              dermatologyConfig,
  orthopedics_neurosurgery: orthopedicsNeurosurgeryConfig,
  dentistry:                dentistryConfig,
  plastic_surgery:          plasticSurgeryConfig,
  general:                  generalConfig,
};

export function getDepartmentConfig(
  department: MedicalDepartment,
): DepartmentClassificationConfig {
  return departmentRegistry[department] ?? generalConfig;
}

export {
  dermatologyConfig,
  orthopedicsNeurosurgeryConfig,
  dentistryConfig,
  plasticSurgeryConfig,
  generalConfig,
};
