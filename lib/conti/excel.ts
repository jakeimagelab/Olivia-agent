import ExcelJS from "exceljs";
import type { ContiExportModel } from "@/lib/conti/exportModel";

const GREEN = "155855";
const PALE_GREEN = "EDF5F3";
const BORDER = "D5DEDB";
const TEXT = "1B2A27";
const GROUP_FILLS = ["EDF5F3", "FFF1EA", "F2EDF8", "F7F0E4", "EAF5ED", "F8ECF2", "F3EFEA", "EAF1EF"];

type SheetSpec = {
  name: string;
  headers: string[];
  widths: number[];
  rows: Array<Array<string | number>>;
};

function configureSheet(sheet: ExcelJS.Worksheet, title: string, spec: SheetSpec) {
  sheet.mergeCells(1, 1, 1, spec.headers.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "Pretendard", size: 16, bold: true, color: { argb: GREEN } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 8;

  const header = sheet.getRow(3);
  header.values = spec.headers;
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = { name: "Pretendard", size: 10, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: { style: "thin", color: { argb: GREEN } }, left: { style: "thin", color: { argb: GREEN } }, bottom: { style: "thin", color: { argb: GREEN } }, right: { style: "thin", color: { argb: GREEN } } };
  });
  spec.rows.forEach((values) => {
    const row = sheet.addRow(values);
    row.height = 42;
    row.eachCell((cell, columnIndex) => {
      cell.font = { name: "Pretendard", size: 9, color: { argb: TEXT } };
      cell.alignment = { vertical: "middle", horizontal: typeof cell.value === "number" ? "center" : "left", wrapText: true };
      cell.border = { top: { style: "thin", color: { argb: BORDER } }, left: { style: "thin", color: { argb: BORDER } }, bottom: { style: "thin", color: { argb: BORDER } }, right: { style: "thin", color: { argb: BORDER } } };
      if (columnIndex === 1) cell.alignment = { ...cell.alignment, horizontal: "center" };
    });
  });
  sheet.columns = spec.widths.map((width) => ({ width }));
  sheet.views = [{ state: "frozen", ySplit: 3, topLeftCell: "A4", activeCell: "A4" }];
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: spec.headers.length } };
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
  };
  sheet.headerFooter.oddFooter = "포토클리닉 · 촬영 콘티     &P / &N";
}

export function createContiExcelWorkbook(model: ContiExportModel): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Olivia · PhotoClinic";
  workbook.created = new Date();
  const specs: SheetSpec[] = [
    {
      name: "콘티",
      headers: ["No", "구분", "장면", "촬영시간", "분", "사진/영상", "키워드", "설명", "장소", "인물", "환자 역할", "준비사항"],
      widths: [8, 13, 20, 18, 7, 13, 20, 42, 17, 18, 15, 30],
      rows: model.contiRows.map((row) => [row.no, row.group, row.scene, row.shootingTime, row.minutes, row.media, row.keyword, row.description, row.location, row.people, row.patientRole, row.preparation]),
    },
    {
      name: "촬영 준비",
      headers: ["완료", "구분", "항목", "비고", "담당"],
      widths: [10, 16, 36, 34, 18],
      rows: model.checklistRows.map((row) => [row.completed, row.group, row.item, row.note, row.assignee]),
    },
    {
      name: "당일 타임테이블",
      headers: ["요일", "순서", "시작", "종료", "분", "장면", "내용", "메이크업(병행)", "등장인물·담당", "장소", "비고"],
      widths: [18, 8, 10, 10, 8, 24, 40, 16, 24, 18, 24],
      rows: model.scheduleRows.map((row) => [row.day, row.order, row.start, row.end, row.minutes, row.scene, row.content, row.makeup, row.people, row.location, row.note]),
    },
  ];

  for (const spec of specs) configureSheet(workbook.addWorksheet(spec.name), `${model.title} · ${spec.name}`, spec);

  const contiSheet = workbook.getWorksheet("콘티");
  const groupFillByName = new Map<string, string>();
  if (contiSheet) {
    model.contiRows.forEach((row, index) => {
      if (!groupFillByName.has(row.group)) groupFillByName.set(row.group, GROUP_FILLS[groupFillByName.size % GROUP_FILLS.length]);
      const fill = groupFillByName.get(row.group) ?? PALE_GREEN;
      for (const cell of [contiSheet.getCell(index + 4, 1), contiSheet.getCell(index + 4, 2)]) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    });
  }

  const scheduleSheet = workbook.getWorksheet("당일 타임테이블");
  if (scheduleSheet) {
    const totalRowNumber = model.scheduleRows.length + 4;
    const totalRow = scheduleSheet.getRow(totalRowNumber);
    totalRow.values = ["", "", "", "합계", model.scheduleRows.length ? { formula: `SUM(E4:E${totalRowNumber - 1})` } : 0, "", "", "", "", "", ""];
    totalRow.font = { name: "Pretendard", size: 10, bold: true, color: { argb: GREEN } };
    totalRow.height = 24;
    if (model.personalComposition.length) {
      const sectionRow = totalRowNumber + 2;
      scheduleSheet.mergeCells(sectionRow, 1, sectionRow, 11);
      const section = scheduleSheet.getCell(sectionRow, 1);
      section.value = `의료진 개인 촬영 구성 · 1인 ${model.personalCompositionTotal}분`;
      section.font = { name: "Pretendard", size: 11, bold: true, color: { argb: "FFFFFF" } };
      section.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
      const personalHeader = scheduleSheet.getRow(sectionRow + 1);
      personalHeader.values = ["순서", "장면", "분", "사진/영상"];
      personalHeader.eachCell({ includeEmpty: true }, (cell, columnIndex) => {
        if (columnIndex > 4) return;
        cell.font = { name: "Pretendard", size: 9, bold: true, color: { argb: GREEN } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE_GREEN } };
      });
      model.personalComposition.forEach((row) => scheduleSheet.addRow([row.order, row.scene, row.minutes, row.media]));
    }
  }
  return workbook;
}

export async function downloadContiExcel(model: ContiExportModel, filename: string): Promise<void> {
  const workbook = createContiExcelWorkbook(model);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
