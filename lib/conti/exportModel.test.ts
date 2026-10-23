import { describe, expect, it } from "vitest";
import type { ContiStudioDocument } from "@/components/conti/v2/types";
import { buildContiExportModel } from "@/lib/conti/exportModel";
import { createContiExcelWorkbook } from "@/lib/conti/excel";
import { createDefaultContiStudioState } from "@/lib/conti/studioState";

function fixture(): ContiStudioDocument {
  return {
    run: { id: "run-1", hospital_name: "테스트병원", specialty: "ophthalmology", doctors: [] },
    groups: [{ id: "group-1", run_id: "run-1", name: "단체", sort: 0 }],
    scenes: [{
      id: "scene-1", run_id: "run-1", group_id: "group-1", sort: 0, scene_code: "S1", name: "단체사진",
      space_text: "로비", minutes: 15, keyword: "신뢰", description: "정면 촬영", procedures: [], people_text: "의료진",
      patient_role_text: "없음", preparation_text: "가운", note: "", template_id: null, field_sources: {}, completed: false,
      repeat_scope: "once", media: "photo",
    }],
    studioState: {
      ...createDefaultContiStudioState(),
      sceneMeta: { "scene-1": { shootingTimeOverride: "월요일 13:00\n또는 18:00" } },
      checklistAssignees: { "prep-1": "실장" },
    },
  };
}

describe("conti output model", () => {
  it("uses one model for edited scene time, checklist, and timetable values", () => {
    const model = buildContiExportModel({
      title: "테스트병원 촬영 콘티",
      document: fixture(),
      checklist: [{ id: "prep-1", label: "가운", completed: true, linkedSceneIds: ["scene-1"], source: "scene" }],
      schedule: [{
        rowId: "scene-1:once", sceneId: "scene-1", sceneIds: ["scene-1"], order: 1, name: "단체사진", location: "로비", minutes: 15,
        date: "2026-10-26", startTime: "13:00", endTime: "13:15", dayLabel: "월", type: "scene", locked: false, media: "photo",
        keyword: "신뢰", description: "정면 촬영", people: "의료진", patientRole: "없음", preparation: "가운", note: "",
      }],
    });
    expect(model.contiRows[0].shootingTime).toBe("월요일 13:00\n또는 18:00");
    expect(model.checklistRows[0]).toMatchObject({ completed: "완료", assignee: "실장" });
    expect(model.scheduleRows[0]).toMatchObject({ day: "2026-10-26 (월)", start: "13:00", end: "13:15" });
  });

  it("creates exactly the three requested styled worksheets", () => {
    const model = buildContiExportModel({ title: "테스트병원 촬영 콘티", document: fixture(), checklist: [], schedule: [] });
    const workbook = createContiExcelWorkbook(model);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["콘티", "촬영 준비", "당일 타임테이블"]);
    expect(workbook.getWorksheet("콘티")?.getRow(3).values).toEqual([undefined, "No", "구분", "장면", "촬영시간", "분", "사진/영상", "키워드", "설명", "장소", "인물", "환자 역할", "준비사항"]);
    expect(workbook.getWorksheet("콘티")?.getCell("A3").fill).toMatchObject({ type: "pattern", fgColor: { argb: "155855" } });
    expect(workbook.getWorksheet("당일 타임테이블")?.pageSetup.orientation).toBe("landscape");
  });
});
