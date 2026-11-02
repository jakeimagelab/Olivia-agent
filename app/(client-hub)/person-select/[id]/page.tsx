"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, Clipboard, Download, FolderOpen, Info, Link2, Plus, RefreshCw, SlidersHorizontal, Trash2, Upload, UserRound, UsersRound, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useDesktopWindowRoute } from "@/lib/desktopWindowContext";
import PhotoSourcePicker from "@/components/photo-classifier/PhotoSourcePicker";
import { formatSeoulDeadline, formatSeoulDateTimeInput } from "@/lib/person-select/date";
import { DEFAULT_PERSON_SELECT_EXTRA_MAX, DEFAULT_PERSON_SELECT_EXTRA_PRICE, DEFAULT_PERSON_SELECT_NOTICE, DEFAULT_PERSON_SELECT_OFFERS, type PersonSelectOffer } from "@/lib/person-select/types";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

type Choice = { id: string; category_key: string; retouch_keys: string[]; memo: string; updated_at: string; person_select_images: { original_file_name: string; source_rel_path: string; thumb_url: string } | null };
type Person = { id: string; display_name: string; group_label: string | null; first_seen_at: string | null; submitted_at: string | null; status_label: string; latest_activity_at: string | null; image_counts: Record<string, number>; need_counts: Record<string, number>; choices: Choice[] ; order?: { lines: OrderLine[]; total: number } };
type Category = { key: string; label: string; pick: number };
type OrderLine = { label: string; detail: string; unitPrice: number; qty: number; amount: number };
type EventData = { id: string; title: string; slug: string; deadline_at: string; status: string; categories: Category[]; retouch_options: { key: string; label: string }[]; source_layout?: "school" | "person-folders"; source_relative_path?: string | null; raw_match_result?: Record<string, unknown> | null; raw_matched_at?: string | null ; offer_notice?: string; extra_price?: number; extra_max?: number; offers?: PersonSelectOffer[] };
type Layout = "school" | "person-folders";
type Group = { label: string; image_count: number };
type Filter = "all" | "done" | "saving" | "unseen";

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function relativeTime(value: string | null) {
  if (!value) return "—";
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}시간 전`;
  return new Intl.RelativeTimeFormat("ko", { numeric: "auto" }).format(-Math.round(minutes / 1440), "day");
}

function folderName(value: string | null | undefined) {
  if (!value) return "";
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

export default function PersonSelectDetailPage() {
  const params = useParams<{ id: string }>(); const router = useRouter(); const windowRoute = useDesktopWindowRoute();
  const routePath = windowRoute.routeHref ? new URL(windowRoute.routeHref, "https://olivia.local").pathname : ""; const routeId = routePath.match(/^\/person-select\/([^/]+)\/?$/)?.[1]; const id = routeId || params.id;
  const [data, setData] = useState<{ event: EventData; people: Person[]; groups: Group[] } | null>(null);
  const [tab, setTab] = useState<"progress" | "upload" | "settings">("progress");
  const [filter, setFilter] = useState<Filter>("all");
  const [picker, setPicker] = useState(false);
  const [path, setPath] = useState("");
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [jobId, setJobId] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Person | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<Layout | null>(null);
  const [rawJobId, setRawJobId] = useState("");
  const [rawResult, setRawResult] = useState<Record<string, unknown> | null>(null);
  const navigate = (href: string) => windowRoute.navigate ? windowRoute.navigate(href, "개인별 사진 셀렉") : router.push(href);
  const load = useCallback(() => fetch(`/api/person-select/${id}`).then((r) => r.json()).then((body) => { if (!body.ok) throw new Error(body.error); setData(body); setAssignments(Object.fromEntries((body.groups as Group[]).map((group) => [group.label, (body.people as Person[]).find((person) => person.group_label === group.label)?.id ?? ""]))); }), [id]);
  useEffect(() => { void load().catch((cause) => setError(cause.message)); fetch("/api/remote-workers/status").then((r) => r.json()).then((body) => setWorkerOnline(body.worker?.online ?? false)); }, [load]);
  useEffect(() => { if (!jobId) return; const timer = window.setInterval(async () => { const body = await (await fetch(`/api/remote-jobs?id=${jobId}`)).json(); if (["COMPLETED", "FAILED", "CANCELED"].includes(body.job?.status)) { window.clearInterval(timer); setResult(body.job.result || { error: body.job.error || body.job.message }); await load(); } }, 1500); return () => window.clearInterval(timer); }, [jobId, load]);
  useEffect(() => { if (!rawJobId) return; const timer = window.setInterval(async () => { const body = await (await fetch(`/api/remote-jobs?id=${rawJobId}`)).json(); if (["COMPLETED", "FAILED", "CANCELED"].includes(body.job?.status)) { window.clearInterval(timer); setRawJobId(""); setRawResult(body.job.result || { error: body.job.error || body.job.message }); await load(); } }, 1500); return () => window.clearInterval(timer); }, [rawJobId, load]);
  const filtered = useMemo(() => (data?.people ?? []).filter((person) => {
    if (filter === "done") return person.status_label.includes("제출");
    if (filter === "saving") return person.status_label === "저장 중";
    if (filter === "unseen") return person.status_label === "미접속";
    return true;
  }), [data, filter]);
  const selectedPerson = data?.people.find((person) => person.id === selectedId) ?? null;
  // Olivia OS에는 이전 고객이 아니라 이 창이 실제로 연 행사만 전달한다.
  useEffect(() => {
    if (!data) return;
    const need = selectedPerson ? Object.values(selectedPerson.need_counts ?? {}).reduce((sum, value) => sum + value, 0) : 0;
    const retouch = selectedPerson?.choices.reduce((sum, choice) => sum + choice.retouch_keys.length, 0) ?? 0;
    const memos = selectedPerson?.choices.filter((choice) => choice.memo).map((choice) => `${choice.person_select_images?.original_file_name ?? ""}: ${choice.memo}`) ?? [];
    emitShellSelection({
      sourceAppId: "person-select",
      sourceWindowId: "person-select",
      itemId: selectedPerson?.id ?? data.event.id,
      title: data.event.title,
      subtitle: selectedPerson
        ? `${selectedPerson.display_name} · ${selectedPerson.status_label} · 고른 사진 ${selectedPerson.choices.length} / ${need}장 · 보정 요청 ${retouch}개${selectedPerson.order?.total ? ` · 추가 주문 ${won(selectedPerson.order.total)}` : ""}`
        : `마감 ${formatSeoulDeadline(data.event.deadline_at)} · ${data.people.length}명`,
      next: memos.length ? memos.join(" / ") : "행사 진행 현황과 고객 선택을 확인합니다.",
      context: { contextScope: "none", routeHref: `/person-select/${data.event.id}`, resourceId: data.event.id, resourceType: "person-select-event", documentTitle: data.event.title, featureItemId: selectedPerson?.id ?? data.event.id },
      featureItemId: selectedPerson?.id ?? data.event.id,
    });
  }, [selectedPerson, data]);
  if (!data) return <main className={styles.shell}><div className={styles.loading}>{error || "행사를 불러오는 중이에요"}</div></main>;
  const currentData = data;
  // 가져오기 방식: 이미 가져온 행사는 그때 방식, 처음이면 이름 폴더 방식
  const currentLayout: Layout = layout ?? (data.people.length && data.event.source_layout === "school" ? "school" : "person-folders");
  const isSchool = currentLayout === "school";
  const personWord = isSchool ? "선생님" : "이름";
  const categories = data.event.categories ?? [];
  const categoryLabels = new Map(categories.map((item) => [item.key, item.label]));
  const counts = { done: data.people.filter((person) => person.status_label.includes("제출")).length, saving: data.people.filter((person) => person.status_label === "저장 중").length, unseen: data.people.filter((person) => person.status_label === "미접속").length };
  const totalPhotos = data.people.reduce((sum, person) => sum + Object.entries(person.image_counts ?? {}).filter(([key]) => key !== "homeroom").reduce((acc, [, value]) => acc + value, 0), 0);
  const pickText = categories.length === 1 ? `한 사람당 ${categories[0].pick}장` : categories.map((item) => `${item.label} ${item.pick}장`).join(" · ");
  const sourceFolder = folderName(data.event.source_relative_path);
  async function startImport() {
    if (!path) return setError(isSchool ? "학교전달 폴더를 선택해 주세요." : "촬영 폴더를 선택해 주세요."); setError(""); setResult(null);
    const response = await fetch("/api/remote-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "PERSON_SELECT_IMPORT", payload: isSchool ? { event_id: id, source_relative_path: path, mappings: [{ folder: "선생님프로필", category: "profile", owner: "person" }, { folder: "담임선생님", category: "homeroom", owner: "group" }] } : { event_id: id, source_relative_path: path, layout: "person-folders" } }) }); const body = await response.json(); if (!response.ok) return setError(body.error); setJobId(body.job?.id || body.id); setResult({ message: "사진 가져오기를 시작했어요." });
  }
  async function startRawMatch() {
    setError(""); setRawResult(null);
    const notSubmitted = currentData.people.filter((person) => !person.submitted_at).length;
    if (notSubmitted && !window.confirm(`아직 제출하지 않은 사람이 ${notSubmitted}명 있습니다. 제출한 사람의 사진만 RAW 매칭할까요?`)) return;
    const response = await fetch("/api/remote-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "PERSON_SELECT_RAW_MATCH", payload: { event_id: id } }) }); const body = await response.json();
    if (!response.ok) return setError(body.error); setRawJobId(body.job?.id || body.id); setRawResult({ message: "RAW 매칭을 시작했어요." });
  }
  async function saveGroups() { const response = await fetch(`/api/person-select/${id}/groups`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignments: currentData.groups.map((group) => ({ group: group.label, person_id: assignments[group.label] || null })) }) }); const body = await response.json(); if (!response.ok) return setError(body.error); await load(); }
  async function saveSettings(patch: Record<string, unknown>) {
    if (patch.status === "open") {
      const unassigned = currentData.groups.filter((group) => !assignments[group.label]);
      if (unassigned.length && !window.confirm(`담임 선생님이 연결되지 않은 반이 ${unassigned.length}개 있습니다. 그래도 행사를 열까요?`)) return;
    }
    const response = await fetch(`/api/person-select/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); const body = await response.json(); if (!response.ok) setError(body.error); else await load();
  }
  const labels = new Map(data.event.retouch_options.map((item) => [item.key, item.label]));
  const loginGuide = isSchool ? "이름과 학교에서 받은 비밀번호 4자리로 들어오세요" : "이름과 포토클리닉에서 받은 비밀번호 4자리로 들어오세요";
  const notice = `주소: ${typeof location !== "undefined" ? location.origin : ""}/pick/${data.event.slug} / ${loginGuide} / 마감: ${formatSeoulDeadline(data.event.deadline_at)}`;
  const tabs = [["progress", "진행 현황", Activity], ["upload", "사진 올리기", Upload], ["settings", "행사 설정", SlidersHorizontal]] as const;
  const filters: [Filter, string, number][] = [["all", "전체", data.people.length], ["done", "제출 완료", counts.done], ["saving", "저장 중", counts.saving], ["unseen", "미접속", counts.unseen]];
  const groupFolders = Array.isArray(result?.groupFolders) ? (result.groupFolders as unknown[]).map(String) : [];
  const unnamedFolders = Array.isArray(result?.unnamedFolders) ? (result.unnamedFolders as unknown[]).map(String) : [];
  const rawBusy = Boolean(rawJobId);
  const rawDisabledReason = counts.done === 0 ? "최종 제출한 사람이 없어요." : workerOnline === false ? "Mac Studio가 꺼져 있어요." : "제출한 사람이 고른 사진의 RAW를 Selected_RAW/이름 폴더로 복사합니다.";
  return <main className={styles.shell}>
    <section className={styles.body}>
      <div className={styles.crumb}><button className={styles.crumbBack} onClick={() => navigate("/person-select")}><ArrowLeft size={14} />개인별 셀렉</button>{sourceFolder ? <><span aria-hidden="true">›</span><span>{sourceFolder}</span></> : null}</div>
      <div className={styles.titleRow}>
        <div><h1 className={styles.title}>{data.event.title}</h1><p className={styles.subtitle}>마감 {formatSeoulDeadline(data.event.deadline_at)} · {data.people.length}명 · {pickText}{totalPhotos ? ` · 사진 ${totalPhotos.toLocaleString()}장` : ""}</p></div>
        <div className={styles.actions}>
          <button className={styles.secondary} onClick={() => void navigator.clipboard.writeText(notice)}><Clipboard size={15} />안내 문구 복사</button>
          <a className={styles.secondary} href={`/api/person-select/${id}/exports/pins`}><Download size={15} />비밀번호 목록</a>
          <a className={styles.secondary} href={`/api/person-select/${id}/exports/retouch`}><Download size={15} />보정 목록 CSV</a>
          <a className={styles.secondary} href={`/api/person-select/${id}/exports/orders`}><Download size={15} />주문 CSV</a>
          <button className={styles.primary} disabled={workerOnline === false || rawBusy || counts.done === 0} title={rawDisabledReason} onClick={startRawMatch}><Link2 size={15} />{rawBusy ? "RAW 매칭 중" : "RAW 매칭"}</button>
        </div>
      </div>
      <div className={styles.segment} role="tablist">{tabs.map(([key, label, Icon]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? styles.segmentActive : ""} onClick={() => setTab(key)}><Icon size={15} />{label}</button>)}</div>
      {error ? <div className={styles.warning}>{error}</div> : null}
      <RawMatchResult result={rawResult ?? data.event.raw_match_result ?? null} at={rawResult ? null : data.event.raw_matched_at ?? null} />
      {tab === "progress" ? <>
        <div className={styles.underTabs}>{filters.map(([key, label, count]) => <button key={key} className={filter === key ? styles.underTabActive : ""} onClick={() => setFilter(key)}>{label}<small>{count}</small></button>)}</div>
        <section className={styles.panel}><div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>{personWord}</th>{data.groups.length ? <th>담임 반</th> : null}{categories.map((category) => <th key={category.key}>{categories.length === 1 ? "고른 사진" : category.label} ({category.pick}장)</th>)}<th>보정 요청</th><th>추가 주문</th><th>상태</th><th>최근 활동</th><th /></tr></thead>
          <tbody>{filtered.map((person) => {
            const requests = person.choices.reduce((sum, choice) => sum + choice.retouch_keys.length, 0);
            return <tr key={person.id} className={person.id === selectedId ? styles.rowSelected : ""} onClick={() => setSelectedId(person.id)}>
              <td><strong>{person.display_name}</strong></td>
              {data.groups.length ? <td>{person.group_label || "—"}</td> : null}
              {categories.map((category) => {
                const own = person.choices.filter((choice) => choice.category_key === category.key);
                const need = person.need_counts?.[category.key] ?? 0;
                if (need === 0) return <td key={category.key} className={styles.muted}>해당 없음</td>;
                return <td key={category.key}><span className={styles.thumbs}>{Array.from({ length: Math.min(Math.max(need, own.length), 4) }, (_, index) => { const thumb = own[index]?.person_select_images?.thumb_url; return thumb ? <img key={index} className={styles.thumb} src={thumb} alt="" /> : <span key={index} className={own[index] ? styles.thumb : styles.thumbEmpty} />; })}<span className={styles.thumbCount}>{own.length > need ? `${own.length}장 (기본 ${need} + 추가 ${own.length - need})` : `${own.length} / ${need}장`}</span></span></td>;
              })}
              <td className={styles.muted}>{requests ? `${requests}개${person.choices.some((choice) => choice.memo) ? " · 메모 있음" : ""}` : person.choices.length ? "기본 보정" : "—"}</td>
              <td className={person.order?.total ? styles.orderTotal : styles.muted} title={person.order?.lines.map((line) => `${line.label} ${line.detail} ×${line.qty}`).join("\n") ?? ""}>{person.order?.total ? won(person.order.total) : "—"}</td>
              <td><span className={`${styles.status} ${person.status_label === "미접속" ? styles.statusIdle : person.status_label === "저장 중" ? styles.statusPending : ""}`}>{person.status_label}</span></td>
              <td className={styles.muted} title={person.latest_activity_at ? new Date(person.latest_activity_at).toLocaleString("ko-KR") : ""}>{relativeTime(person.latest_activity_at)}</td>
              <td><button className={styles.detailButton} onClick={(event) => { event.stopPropagation(); setSelectedId(person.id); setDrawer(person); }}>보기</button></td>
            </tr>;
          })}</tbody>
        </table></div>{filtered.length === 0 ? <div className={styles.loading}>해당하는 사람이 없어요.</div> : null}</section>
        <div className={styles.infoChips}>
          {groupFolders.length ? <span className={styles.infoChip}><UsersRound size={13} />그룹 사진 <b>{groupFolders.join(" · ")}</b> 은 작가가 직접 고름</span> : null}
          {unnamedFolders.length ? <span className={styles.infoChip}><Info size={13} />이름 미변경 <b>{unnamedFolders.join(" · ")}</b> 건너뜀</span> : null}
          {!isSchool && sourceFolder ? <span className={styles.infoChip}><FolderOpen size={13} />RAW 저장 위치 <b>{sourceFolder}/Selected_RAW/이름</b></span> : null}
        </div>
        {data.groups.length ? <section className={styles.uploadCard} style={{ marginTop: 18 }}><h2>담임 반 연결</h2><p className={styles.summary}>반 사진을 담당 선생님에게 연결합니다.</p><div className={styles.groupRows}>{data.groups.map((group) => <div className={styles.groupRow} key={group.label}><strong>{group.label}</strong><select className={styles.select} value={assignments[group.label] || ""} onChange={(e) => setAssignments({ ...assignments, [group.label]: e.target.value })}><option value="">미연결</option>{data.people.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select><span>{group.image_count}장</span></div>)}</div><div className={styles.formActions}><button className={styles.secondary} onClick={saveGroups}>담임 반 연결 저장</button></div></section> : null}
      </> : null}
      {tab === "upload" ? <div className={styles.uploadGrid}>
        <section className={styles.uploadCard}>
          <h2>폴더에서 사진 올리기</h2>
          <div className={styles.segment} style={{ margin: "6px 0 12px" }}>{([["person-folders", "이름 폴더 (김춘자/JPG원본)", UserRound], ["school", "학교 (선생님프로필·담임선생님)", UsersRound]] as const).map(([key, label, Icon]) => <button key={key} className={currentLayout === key ? styles.segmentActive : ""} onClick={() => setLayout(key)}><Icon size={15} />{label}</button>)}</div>
          <p className={styles.summary}>Mac Studio에서 {isSchool ? "학교전달" : "촬영"} 폴더를 골라 썸네일과 1600px 미리보기만 올립니다.</p>
          {workerOnline === false ? <div className={styles.warning}>Mac Studio가 꺼져 있어요. 켜진 뒤 다시 시도해 주세요.</div> : null}
          <div className={styles.selectedPath}>{path || "선택된 폴더가 없습니다."}</div>
          <div className={styles.actions} style={{ justifyContent: "flex-start" }}><button className={styles.secondary} disabled={workerOnline === false} onClick={() => setPicker(true)}><FolderOpen size={15} />폴더 선택</button><button className={styles.primary} disabled={workerOnline === false || !path || Boolean(jobId && !result?.error && !result?.photoCount)} onClick={startImport}><Upload size={15} />사진 올리기</button></div>
          {!path && workerOnline !== false ? <p className={styles.disabledReason}>사진을 올리려면 {isSchool ? "학교전달" : "촬영"} 폴더를 먼저 선택하세요.</p> : null}
          <div className={styles.field} style={{ marginTop: 20 }}><label>경로 직접 입력</label><input className={styles.input} value={path} onChange={(e) => setPath(e.target.value)} placeholder={isSchool ? "/Users/jakemacstudio/UGnasync/.../학교전달" : "/Users/jakemacstudio/UGnasync/.../1031_촬영폴더"} /><small className={styles.summary}>Mac Studio의 폴더 경로를 그대로 붙여넣어도 돼요.</small></div>
          {result ? <div className={styles.result}>{result.photoCount !== undefined ? <><div>{`사진 ${Number(result.photoCount).toLocaleString()}장 · ${isSchool ? "선생님" : "사람"} ${Number(result.peopleCount).toLocaleString()}명 등록 · 새 비밀번호 ${Array.isArray(result.createdPeople) ? result.createdPeople.length : 0}개 발급 · 실패 ${Number(result.failedCount ?? 0)}장`}</div>{Array.isArray(result.skippedFolders) && result.skippedFolders.length ? <div className={styles.skippedFolders}>건너뛴 폴더: {result.skippedFolders.map(String).join(" / ")}</div> : null}{unnamedFolders.length ? <div className={styles.warning}>이름을 아직 안 바꾼 폴더라 올리지 않았어요: {unnamedFolders.join(" / ")}</div> : null}{groupFolders.length ? <div className={styles.skippedFolders}>그룹 사진은 고객에게 올리지 않았어요: {groupFolders.join(" / ")}</div> : null}{Array.isArray(result.emptyFolders) && result.emptyFolders.length ? <div className={styles.skippedFolders}>JPG가 없어 건너뛴 폴더: {result.emptyFolders.map(String).join(" / ")}</div> : null}{Array.isArray(result.failed) && result.failed.length ? <ul className={styles.failureList}>{result.failed.map((item, index) => { const failed = item as Record<string, unknown>; return <li key={`${String(failed.file || "file")}-${index}`}>{String(failed.file || "파일")}: {String(failed.reason || "가져오기 실패")}</li>; })}</ul> : null}</> : String(result.message || result.error || "처리 중이에요.")}</div> : null}
        </section>
        <aside className={styles.uploadCard}><h2>가져오는 항목</h2>{isSchool ? <><div className={styles.notice}>선생님프로필 → 사람 이름으로 연결<br />담임선생님 → 반 단위로 등록 후 아래에서 연결</div><p className={styles.summary}>학생사진 폴더는 건너뛰고 가져오지 않습니다.<br />원본은 업로드하지 않습니다. 480px 썸네일과 1600px 미리보기만 private Storage에 저장합니다.</p></> : <><div className={styles.notice}>김춘자 / 이지영 … 폴더 이름 → 로그인 이름<br />각 폴더 안 JPG원본 → 그 사람만 보는 사진<br />그룹1, 그룹2 … → 고객에게 올리지 않음<br />개인1, 개인2 … → 이름을 바꾼 뒤 다시 올리기</div><p className={styles.summary}>원본과 RAW는 업로드하지 않습니다. 480px 썸네일과 1600px 미리보기만 private Storage에 저장합니다.<br />RAW 매칭은 각 이름 폴더 안에서 같은 파일 이름의 RAW를 찾아 촬영 폴더/Selected_RAW/이름 으로 복사합니다.</p></>}</aside>
      </div> : null}
      {tab === "settings" ? <section className={styles.panel} style={{ padding: 22 }}>
        <div className={styles.formGrid}>
          <div className={`${styles.field} ${styles.fieldFull}`}><label>행사명</label><input className={styles.input} value={data.event.title} onChange={(e) => setData({ ...data, event: { ...data.event, title: e.target.value } })} /></div>
          <div className={styles.field}><label>마감일 (KST)</label><input className={styles.input} type="datetime-local" value={formatSeoulDateTimeInput(data.event.deadline_at)} onChange={(e) => setData({ ...data, event: { ...data.event, deadline_at: e.target.value } })} /></div>
          <div className={styles.field}><label>상태</label><select className={styles.select} value={data.event.status} onChange={(e) => setData({ ...data, event: { ...data.event, status: e.target.value } })}><option value="draft">준비 중 (고객 접속 안 됨)</option><option value="open">열림 (고객 선택 가능)</option><option value="closed">마감</option></select></div>
          <div className={`${styles.field} ${styles.fieldFull}`}><label>고를 사진 수량</label><div className={styles.groupRows}>{categories.map((category, index) => <div className={styles.groupRow} key={category.key}><strong>{category.label}</strong><select className={styles.select} value={category.pick} onChange={(e) => setData({ ...data, event: { ...data.event, categories: categories.map((item, itemIndex) => itemIndex === index ? { ...item, pick: Number(e.target.value) } : item) } })}>{Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}장</option>)}</select><span>한 사람당</span></div>)}</div><small className={styles.summary}>올라온 사진이 수량보다 적은 사람은 있는 만큼만 고르면 됩니다.</small></div>
          <OfferSettings event={data.event} onChange={(patch) => setData({ ...data, event: { ...data.event, ...patch } })} />
          <div className={`${styles.field} ${styles.fieldFull}`}><label>접속 안내 (고객에게 보낼 주소·비밀번호 안내)</label><div className={styles.notice}>주소: {typeof location !== "undefined" ? location.origin : ""}/pick/{data.event.slug}<br />{loginGuide}.<br />마감: {formatSeoulDeadline(data.event.deadline_at)}</div><button className={styles.secondary} onClick={() => void navigator.clipboard.writeText(notice)}><Clipboard size={15} />안내 문구 복사</button></div>
        </div>
        <div className={styles.formActions}><button className={styles.secondary} onClick={() => saveSettings({ title: data.event.title, deadline_at: data.event.deadline_at, status: data.event.status, categories, offer_notice: data.event.offer_notice ?? "", extra_price: data.event.extra_price ?? 0, extra_max: data.event.extra_max ?? 0, offers: data.event.offers ?? [] })}>설정 저장</button></div>
      </section> : null}
    </section>
    {picker ? <PhotoSourcePicker targetWorker="jake-macstudio-01" sourceScope="person-select" onCancel={() => setPicker(false)} onSelectRemote={(selection) => { setPath(selection.path); setPicker(false); }} /> : null}
    {drawer ? <PersonDrawer person={data.people.find((person) => person.id === drawer.id) ?? drawer} personWord={isSchool ? "선생님" : ""} eventId={id} labels={labels} categoryLabels={categoryLabels} options={data.event.retouch_options} onClose={() => setDrawer(null)} onSaved={load} onPin={async () => { const body = await (await fetch(`/api/person-select/${id}/people/${drawer.id}/pin`, { method: "POST" })).json(); if (body.ok) setError(`${drawer.display_name} 새 비밀번호: ${body.pin}`); }} /> : null}
  </main>;
}

function PersonDrawer({ person, personWord, eventId, labels, categoryLabels, options, onClose, onSaved, onPin }: { person: Person; personWord: string; eventId: string; labels: Map<string, string>; categoryLabels: Map<string, string>; options: { key: string; label: string }[]; onClose: () => void; onSaved: () => Promise<void>; onPin: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [keys, setKeys] = useState<string[]>([]);
  async function save(choice: Choice) {
    const response = await fetch(`/api/person-select/${eventId}/choices/${choice.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retouch_keys: keys, memo }) });
    if (!response.ok) return; setEditing(null); await onSaved();
  }
  return <div className={styles.drawerBackdrop} onClick={onClose}><aside className={styles.drawer} onClick={(e) => e.stopPropagation()}><div className={styles.drawerTop}><div><p className={styles.eyebrow}>상세</p><h2>{person.display_name}{personWord ? ` ${personWord}` : ""}</h2></div><button className={styles.weak} onClick={onClose}><X /></button></div>{person.choices.map((choice) => <section className={styles.choiceDetail} key={choice.id}>{choice.person_select_images ? <img src={choice.person_select_images.thumb_url} alt="고른 사진" /> : null}<h3>{categoryLabels.get(choice.category_key) ?? choice.category_key}</h3><p>{choice.person_select_images?.original_file_name}</p>{editing === choice.id ? <><div className={styles.chipGrid}>{options.map((option) => <button key={option.key} className={`${styles.chip} ${keys.includes(option.key) ? styles.chipActive : ""}`} onClick={() => setKeys(keys.includes(option.key) ? keys.filter((key) => key !== option.key) : [...keys, option.key])}>{option.label}</button>)}</div><textarea className={styles.textarea} value={memo} onChange={(e) => setMemo(e.target.value)} /><div className={styles.actions} style={{ justifyContent: "flex-start", marginTop: 10 }}><button className={styles.primary} onClick={() => void save(choice)}>관리자 수정 저장</button><button className={styles.secondary} onClick={() => setEditing(null)}>취소</button></div></> : <><p>{choice.retouch_keys.map((key) => labels.get(key) || key).join(" / ") || "기본 보정"}</p><p>{choice.memo || "메모 없음"}</p><button className={styles.secondary} onClick={() => { setEditing(choice.id); setKeys(choice.retouch_keys); setMemo(choice.memo); }}>관리자 수정</button></>}</section>)}{person.order?.lines.length ? <section className={styles.choiceDetail}><h3>추가 주문 · {won(person.order.total)}</h3>{person.order.lines.map((line, index) => <p key={index}>{line.label}{line.detail ? ` · ${line.detail}` : ""} — {line.qty} × {won(line.unitPrice)} = {won(line.amount)}</p>)}</section> : null}<button className={styles.secondary} style={{ marginTop: 18 }} onClick={() => void onPin()}><RefreshCw size={15} style={{ verticalAlign: -3, marginRight: 5 }} />PIN 재발급</button></aside></div>;
}

function RawMatchResult({ result, at }: { result: Record<string, unknown> | null; at: string | null }) {
  if (!result) return null;
  const list = (value: unknown) => (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  if (result.message && result.matchedCount === undefined) return <div className={styles.result}>{String(result.message)}</div>;
  if (result.error) return <div className={styles.warning}>RAW 매칭: {String(result.error)}</div>;
  const missing = list(result.missing); const ambiguous = list(result.ambiguous); const conflicts = list(result.conflicts); const notSubmitted = Array.isArray(result.notSubmitted) ? result.notSubmitted.map(String) : [];
  return <div className={styles.result}>
    <div>{`RAW 매칭${at ? ` (${new Date(at).toLocaleString("ko-KR")})` : ""} · 제출 ${Number(result.submittedPeople ?? 0)}명 · 고른 사진 ${Number(result.selectedCount ?? 0)}장 · 새로 복사 ${Number(result.matchedCount ?? 0)}장 · 이미 있음 ${Number(result.alreadyCopiedCount ?? 0)}장 → 촬영 폴더/${String(result.outputRelativePath ?? "Selected_RAW")}`}</div>
    {notSubmitted.length ? <div className={styles.skippedFolders}>미제출로 빠진 사람: {notSubmitted.join(" / ")}</div> : null}
    {missing.length ? <ul className={styles.failureList}>{missing.map((item, index) => <li key={`m-${index}`}>{String(item.name)} · {String(item.jpg)}: RAW를 찾지 못했어요</li>)}</ul> : null}
    {ambiguous.length ? <ul className={styles.failureList}>{ambiguous.map((item, index) => <li key={`a-${index}`}>{String(item.name)} · {String(item.jpg)}: 같은 이름의 RAW가 여러 개라 직접 확인이 필요해요 ({Array.isArray(item.candidates) ? item.candidates.length : 0}개)</li>)}</ul> : null}
    {conflicts.length ? <ul className={styles.failureList}>{conflicts.map((item, index) => <li key={`c-${index}`}>{String(item.name)} · {String(item.raw)}: 같은 이름의 다른 파일이 이미 있어 덮어쓰지 않았어요</li>)}</ul> : null}
  </div>;
}

/** "6R (6x8inch) = 30000" 한 줄을 선택지로 읽는다. 3만, 30,000원 같은 표기도 받는다. */
function parsePrice(text: string) {
  const value = text.replace(/[,\s원]/g, "");
  const man = value.match(/^(\d+(?:\.\d+)?)만$/);
  if (man) return Math.round(Number(man[1]) * 10_000);
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

function optionsToText(offer: PersonSelectOffer) {
  return offer.options.map((option) => `${option.label} = ${option.price}`).join("\n");
}

function textToOptions(text: string, previous: PersonSelectOffer["options"]) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const at = line.lastIndexOf("=");
    const label = (at >= 0 ? line.slice(0, at) : line).trim();
    const price = at >= 0 ? parsePrice(line.slice(at + 1)) : NaN;
    // 이미 받은 주문이 끊기지 않게 같은 이름의 선택지는 기존 구분값을 그대로 쓴다.
    const key = previous.find((option) => option.label === label)?.key ?? `opt-${Date.now().toString(36)}-${index}`;
    return { key, label, price: Number.isFinite(price) ? price : -1 };
  });
}

/** 행사 설정: 고객 안내 문구, 추가 보정 가격, 신청받을 상품 */
function OfferSettings({ event, onChange }: { event: EventData; onChange: (patch: Partial<EventData>) => void }) {
  const offers = event.offers ?? [];
  const [optionTexts, setOptionTexts] = useState<Record<string, string>>(() => Object.fromEntries(offers.map((offer) => [offer.key, optionsToText(offer)])));
  const empty = !event.offer_notice && !event.extra_price && !offers.length;
  const setOffer = (index: number, patch: Partial<PersonSelectOffer>) => onChange({ offers: offers.map((offer, offerIndex) => offerIndex === index ? { ...offer, ...patch } : offer) });
  function fillDefaults() {
    onChange({ offer_notice: DEFAULT_PERSON_SELECT_NOTICE, extra_price: DEFAULT_PERSON_SELECT_EXTRA_PRICE, extra_max: DEFAULT_PERSON_SELECT_EXTRA_MAX, offers: DEFAULT_PERSON_SELECT_OFFERS });
    setOptionTexts(Object.fromEntries(DEFAULT_PERSON_SELECT_OFFERS.map((offer) => [offer.key, optionsToText(offer)])));
  }
  function addOffer() {
    const key = `offer-${Date.now().toString(36)}`;
    onChange({ offers: [...offers, { key, label: "", unit: "개", price: 0, note: "", needs_photo: false, options: [] }] });
    setOptionTexts({ ...optionTexts, [key]: "" });
  }
  return <div className={`${styles.field} ${styles.fieldFull}`}>
    <label>고객 안내 · 추가 주문</label>
    <div className={styles.offerBox}>
      {empty ? <div className={styles.offerEmpty}><span>아직 안내 문구와 상품이 없어요.</span><button className={styles.secondary} onClick={fillDefaults}>기본값 불러오기 (추가 보정 5만원 · 액자 · 앨범)</button></div> : null}
      <div className={styles.field}><small className={styles.summary}>고객 화면 맨 위에 보이는 글</small><textarea className={styles.textarea} maxLength={2000} value={event.offer_notice ?? ""} onChange={(e) => onChange({ offer_notice: e.target.value })} placeholder="예: 한 분당 보정본 1장을 드립니다." /></div>
      <div className={styles.offerRow}>
        <div className={styles.field}><small className={styles.summary}>추가 보정 가격 (장당, 0이면 추가로 못 고름)</small><input className={styles.input} inputMode="numeric" value={event.extra_price ?? 0} onChange={(e) => onChange({ extra_price: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></div>
        <div className={styles.field}><small className={styles.summary}>더 고를 수 있는 최대 장수</small><select className={styles.select} value={event.extra_max ?? 0} onChange={(e) => onChange({ extra_max: Number(e.target.value) })}>{Array.from({ length: 21 }, (_, n) => <option key={n} value={n}>{n}장</option>)}</select></div>
      </div>
      {offers.map((offer, index) => <div key={offer.key} className={styles.offerItem}>
        <div className={styles.offerRow}>
          <div className={styles.field}><small className={styles.summary}>상품 이름</small><input className={styles.input} value={offer.label} onChange={(e) => setOffer(index, { label: e.target.value })} placeholder="예: 액자 제작" /></div>
          <div className={styles.field}><small className={styles.summary}>단위</small><input className={styles.input} value={offer.unit} onChange={(e) => setOffer(index, { unit: e.target.value })} placeholder="개, 권" /></div>
          <div className={styles.field}><small className={styles.summary}>가격 (크기 선택지가 없을 때)</small><input className={styles.input} inputMode="numeric" value={offer.price} onChange={(e) => setOffer(index, { price: Number(e.target.value.replace(/\D/g, "")) || 0 })} disabled={Boolean(offer.options.length)} /></div>
        </div>
        <div className={styles.offerRow}>
          <div className={styles.field}><small className={styles.summary}>크기·종류 선택지 (한 줄에 하나: 이름 = 가격)</small><textarea className={styles.textarea} value={optionTexts[offer.key] ?? optionsToText(offer)} onChange={(e) => { setOptionTexts({ ...optionTexts, [offer.key]: e.target.value }); setOffer(index, { options: textToOptions(e.target.value, offer.options) }); }} placeholder={"6R (6x8inch) = 30000\n16R (16x20inch) = 100000"} /></div>
          <div className={styles.field}><small className={styles.summary}>구성 설명 (고객에게 보임)</small><textarea className={styles.textarea} value={offer.note} onChange={(e) => setOffer(index, { note: e.target.value })} placeholder={"20P 블랙가죽\n5x7inch 액자 포함"} /></div>
        </div>
        <div className={styles.offerFoot}>
          <label className={styles.check}><input type="checkbox" checked={offer.needs_photo} onChange={(e) => setOffer(index, { needs_photo: e.target.checked })} /> 고객이 고른 사진 중 하나를 지정 (액자 등)</label>
          <button className={styles.weak} onClick={() => onChange({ offers: offers.filter((_, offerIndex) => offerIndex !== index) })}><Trash2 size={14} /> 상품 빼기</button>
        </div>
        {offer.options.some((option) => option.price < 0) ? <p className={styles.disabledReason}>가격을 읽지 못한 줄이 있어요. &quot;이름 = 30000&quot; 처럼 적어주세요.</p> : null}
      </div>)}
      <button className={styles.secondary} onClick={addOffer}><Plus size={15} />상품 추가</button>
    </div>
  </div>;
}
