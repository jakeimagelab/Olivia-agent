"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ContiExportModel } from "@/lib/conti/exportModel";
import { CONTI_GROUP_COLORS } from "@/lib/conti/departmentTaxonomy";
import styles from "@/components/conti/v2/ContiV2.module.css";

export default function ContiPrintDocument({ model }: { model: ContiExportModel }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const groupColors = new Map<string, string>();
  for (const row of model.contiRows) if (!groupColors.has(row.group)) groupColors.set(row.group, CONTI_GROUP_COLORS[groupColors.size % CONTI_GROUP_COLORS.length]);
  if (!mounted) return null;

  return createPortal(<div className={styles.printDocument} data-conti-print-document="true">
    <PrintPage title={model.title} subtitle="상세 촬영 콘티" page="1 / 3">
      <table className={`${styles.printTable} ${styles.printContiTable}`}>
        <thead><tr>{["No", "구분", "장면", "촬영시간", "분", "사진/영상", "키워드", "설명", "장소", "인물", "환자 역할", "준비사항"].map((label) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{model.contiRows.map((row) => <tr key={row.no}>
          <td>{row.no}</td><td style={{ borderLeftColor: groupColors.get(row.group) }}>{row.group}</td><td>{row.scene}</td><td>{row.shootingTime}</td><td>{row.minutes}</td><td>{row.media}</td><td>{row.keyword}</td><td>{row.description}</td><td>{row.location}</td><td>{row.people}</td><td>{row.patientRole}</td><td>{row.preparation}</td>
        </tr>)}</tbody>
      </table>
    </PrintPage>
    <PrintPage title={model.title} subtitle="촬영 준비 체크리스트" page="2 / 3">
      <table className={`${styles.printTable} ${styles.printChecklistTable}`}>
        <thead><tr>{["완료", "구분", "항목", "비고", "담당"].map((label) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{model.checklistRows.map((row, index) => <tr key={`${row.item}-${index}`}><td>{row.completed}</td><td>{row.group}</td><td>{row.item}</td><td>{row.note}</td><td>{row.assignee}</td></tr>)}</tbody>
      </table>
    </PrintPage>
    <PrintPage title={model.title} subtitle="당일 타임테이블" page="3 / 3" className={styles.printSchedulePage}>
      <table className={`${styles.printTable} ${styles.printScheduleTable}`}>
        <thead><tr>{["요일", "순서", "시작", "종료", "분", "장면", "내용", "메이크업(병행)", "등장인물·담당", "장소", "비고"].map((label) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{model.scheduleRows.map((row) => <tr key={`${row.order}-${row.scene}`}><td>{row.day}</td><td>{row.order}</td><td>{row.start}</td><td>{row.end}</td><td>{row.minutes}</td><td>{row.scene}</td><td>{row.content}</td><td>{row.makeup}</td><td>{row.people}</td><td>{row.location}</td><td>{row.note}</td></tr>)}</tbody>
      </table>
      {model.personalComposition.length ? <section className={styles.printPersonalComposition}>
        <header><h3>의료진 개인 촬영 구성</h3><span>1인 합계 {model.personalCompositionTotal}분</span></header>
        <div>{model.personalComposition.map((row) => <p key={`${row.order}-${row.scene}`}><b>{row.order}</b><span>{row.scene}</span><span>{row.minutes}분</span><span>{row.media}</span></p>)}</div>
      </section> : null}
    </PrintPage>
  </div>, document.body);
}

function PrintPage({ title, subtitle, page, children, className }: { title: string; subtitle: string; page: string; children: React.ReactNode; className?: string }) {
  return <section className={`${styles.printPage}${className ? ` ${className}` : ""}`}>
    <header className={styles.printHeader}><div><span>PHOTOCLINIC · CONTI</span><h1>{title}</h1></div><div><strong>{subtitle}</strong><small>현장 촬영용 문서</small></div></header>
    <div className={styles.printPageBody}>{children}</div>
    <footer><span>포토클리닉 · 제이크이미지연구소</span><span>{page}</span></footer>
  </section>;
}
