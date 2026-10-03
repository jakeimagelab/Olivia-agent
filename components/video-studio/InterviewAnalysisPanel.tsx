"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, Copy, FileDown, FolderOpen, Play, Search, Sparkles } from "lucide-react";
import PhotoSourcePicker from "@/components/photo-classifier/PhotoSourcePicker";
import photoStyles from "@/components/photo-workspace/PhotoWorkspace.module.css";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { formatClock, locateInClip, secondsToTimecode } from "@/lib/video-interview/timecode";
import { BLOG_CATEGORY_LABEL, CONTENT_TYPE_LABEL, type QaBlock, type VideoInterviewResult } from "@/lib/video-interview/types";
import type { MarkerKind, MarkerOptions } from "@/lib/video-interview/exporters";
import { exportInterview, type ExportKind } from "./exportPlan";
import { copyText, isActiveJob, jobFolderName, jobPercent, type ReelEdits, type VideoStudioJob } from "./useVideoStudio";
import styles from "./VideoStudio.module.css";

const STATUS_LABEL: Record<string, string> = { QUEUED: "대기 중", RUNNING: "분석 중", COMPLETED: "완료", FAILED: "실패", CANCELLED: "취소됨" };
const KIND_LABEL: Record<MarkerKind, string> = { qa: "Q&A", reel: "릴스", edit: "편집", cut: "컷", compliance: "주의" };
const dateFormat = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function JobList({ jobs, onOpen, empty }: { jobs: VideoStudioJob[]; onOpen: (job: VideoStudioJob) => void; empty: string }) {
  if (!jobs.length) return <div className={styles.empty}>{empty}</div>;
  return (
    <div className={styles.jobList}>
      {jobs.map((job) => (
        <button key={job.id} type="button" className={styles.jobRow} onClick={() => onOpen(job)}>
          <span>
            <strong>{jobFolderName(job)}</strong>
            <small>{dateFormat.format(new Date(job.created_at))}{job.payload?.context ? ` · ${job.payload.context}` : ""}{isActiveJob(job) ? ` · ${jobPercent(job)}%` : ""}</small>
          </span>
          <span className={styles.status} data-state={job.status}>{STATUS_LABEL[job.status] ?? job.status}</span>
        </button>
      ))}
    </div>
  );
}

export function JobProgress({ job }: { job: VideoStudioJob }) {
  const percent = jobPercent(job);
  const failed = job.status === "FAILED" || job.status === "CANCELLED";
  return (
    <div className={`${styles.card} ${styles.progressCard}`}>
      <div className={styles.progressTop}>
        <strong>{jobFolderName(job)}</strong>
        <span>{failed ? STATUS_LABEL[job.status] : `${percent}%`}</span>
      </div>
      {!failed ? <div className={styles.progressBar}><i style={{ width: `${percent}%` }} /></div> : null}
      <p className={styles.progressMessage}>
        {failed ? job.error || job.message || "작업이 실패했습니다." : job.progress?.message || (job.status === "QUEUED" ? "Mac Studio가 작업을 받기를 기다리는 중입니다." : "준비 중")}
      </p>
    </div>
  );
}

export default function InterviewAnalysisPanel({
  jobs,
  selectedJob,
  result,
  edits,
  editRoot,
  onSelect,
  onStart,
  notify,
}: {
  jobs: VideoStudioJob[];
  selectedJob: VideoStudioJob | null;
  result: VideoInterviewResult | null;
  edits: ReelEdits;
  editRoot: string;
  onSelect: (jobId: string | null) => void;
  onStart: (payload: { source_relative_path: string; context: string }) => Promise<void>;
  notify: (message: string) => void;
}) {
  if (selectedJob && result) return <ResultView result={result} edits={edits} editRoot={editRoot} onBack={() => onSelect(null)} notify={notify} />;
  if (selectedJob) {
    return (
      <div className={styles.panel}>
        <button type="button" className={styles.backLink} onClick={() => onSelect(null)}><ChevronLeft size={13} style={{ verticalAlign: -2 }} /> 새 분석 · 최근 목록</button>
        <JobProgress job={selectedJob} />
        {selectedJob.status === "COMPLETED" ? <p className={styles.hint}>결과를 불러오는 중…</p> : null}
        {isActiveJob(selectedJob) ? <p className={styles.hint}>창을 닫아도 Mac Studio에서 계속 진행됩니다. 1시간 촬영 기준 10~15분 정도 걸립니다.</p> : null}
      </div>
    );
  }
  return <SetupView jobs={jobs} onOpen={(job) => onSelect(job.id)} onStart={onStart} />;
}

function SetupView({ jobs, onOpen, onStart }: { jobs: VideoStudioJob[]; onOpen: (job: VideoStudioJob) => void; onStart: (payload: { source_relative_path: string; context: string }) => Promise<void> }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selection, setSelection] = useState<RemoteNasSelection | null>(null);
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (!selection?.path) return setError("촬영 폴더를 먼저 선택해 주세요.");
    setBusy(true);
    setError(null);
    try {
      await onStart({ source_relative_path: selection.path, context });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "분석을 시작하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel}>
      <p className={styles.panelIntro}>촬영 폴더를 고르면 영상에서 음성만 뽑아 전사하고, 질문·답변별로 나눠 핵심과 릴스 구간을 정리합니다. 원본 영상은 그대로 두고, 결과는 작업 디스크의 <b>인터뷰분석</b> 폴더에 저장됩니다.</p>

      <h3 className={styles.sectionTitle}><span>1.</span>촬영 폴더 선택</h3>
      <div className={photoStyles.folderRow}>
        <span className={photoStyles.folderState}><FolderOpen size={18} />{selection ? selection.displayPath || "Workstation 최상위" : "폴더가 선택되지 않았습니다."}</span>
        <button type="button" className={photoStyles.secondaryButton} onClick={() => setPickerOpen(true)}>폴더 선택</button>
      </div>
      <p className={styles.hint}>여러 파일로 나뉜 촬영본(C0001, C0002…)은 파일명 순서대로 이어서 하나의 인터뷰로 분석합니다.</p>

      <h3 className={styles.sectionTitle}><span>2.</span>촬영 정보</h3>
      <textarea
        className={styles.contextInput}
        value={context}
        maxLength={500}
        onChange={(event) => setContext(event.target.value)}
        placeholder="예) 강남 미소치과 김하늘 원장 인터뷰, 개원 10주년 · 이달의 원장님용"
      />
      <p className={styles.hint}>병원명·인물·주제를 적으면 이름과 전문용어 인식, Q&A 정리가 더 정확해집니다.</p>

      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.actions}>
        <button type="button" className={photoStyles.primaryButton} disabled={busy || !selection} onClick={() => void start()}>
          <Sparkles size={15} /> {busy ? "요청 중…" : "인터뷰 분석 시작"}
        </button>
      </div>

      <h3 className={styles.sectionTitle}>최근 분석</h3>
      <JobList jobs={jobs} onOpen={onOpen} empty="아직 분석한 촬영이 없습니다." />

      {pickerOpen ? <PhotoSourcePicker onCancel={() => setPickerOpen(false)} onSelectRemote={(next) => { setSelection(next); setPickerOpen(false); }} /> : null}
    </div>
  );
}

type Row = { key: string; kind: MarkerKind; start: number; end: number; title: string; text: string; qa?: QaBlock; score?: number };

function ResultView({ result, edits, editRoot, onBack, notify }: { result: VideoInterviewResult; edits: ReelEdits; editRoot: string; onBack: () => void; notify: (message: string) => void }) {
  const { analysis } = result;
  const [filter, setFilter] = useState<MarkerKind | "all">("all");
  const [query, setQuery] = useState("");
  const [openQa, setOpenQa] = useState<Record<number, boolean>>({});
  const [options, setOptions] = useState<MarkerOptions>({ edits: true, cuts: true, compliance: true });
  const tc = (seconds: number) => secondsToTimecode(seconds, result.rate);
  const multiClip = result.clips.length > 1;

  const rows = useMemo<Row[]>(() => [
    ...analysis.qa.map((qa) => ({ key: `qa${qa.id}`, kind: "qa" as const, start: qa.start, end: qa.end, title: `${qa.label}. ${qa.topic}`, text: qa.summary, qa })),
    ...analysis.reels.map((reel) => ({ key: `reel${reel.id}`, kind: "reel" as const, start: edits.adjusted[reel.id]?.start ?? reel.start, end: edits.adjusted[reel.id]?.end ?? reel.end, title: reel.title, text: reel.hook ? `훅: ${reel.hook}` : reel.reason, score: reel.score })),
    ...analysis.editIdeas.map((idea) => ({ key: `edit${idea.id}`, kind: "edit" as const, start: idea.start, end: idea.end, title: idea.type, text: idea.idea })),
    ...analysis.cuts.map((cut) => ({ key: `cut${cut.id}`, kind: "cut" as const, start: cut.start, end: cut.end, title: "컷 후보", text: cut.reason })),
    ...analysis.compliance.map((flag) => ({ key: `flag${flag.id}`, kind: "compliance" as const, start: flag.start, end: flag.end, title: `의료광고 주의 · ${flag.issue}`, text: `"${flag.text}" → ${flag.suggestion}` })),
  ].sort((a, b) => a.start - b.start), [analysis, edits]);

  const counts = useMemo(() => rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.kind]: (acc[row.kind] ?? 0) + 1 }), {}), [rows]);
  const visible = filter === "all" ? rows : rows.filter((row) => row.kind === filter);
  const matches = query.trim() ? result.segments.filter((segment) => segment.text.includes(query.trim())) : [];

  const copyTc = async (seconds: number) => notify((await copyText(tc(seconds))) ? `${tc(seconds)} 복사됨` : "복사하지 못했습니다");
  const exportAs = (kind: ExportKind) => {
    exportInterview(kind, result, edits, editRoot, options);
    const adopted = analysis.reels.some((reel) => edits.adopted[reel.id]);
    notify(kind === "capcut" ? "자막 파일을 내려받는 중" : `내려받기 완료${kind === "premiere" || kind === "fcp" ? ` · 릴스 ${adopted ? "채택분" : "전체 후보"} 포함` : ""}`);
  };
  const where = (seconds: number) => {
    if (!multiClip) return null;
    const located = locateInClip(seconds, result.clips);
    return located ? `${located.clipName.replace(/\.[^.]+$/, "")} ${formatClock(located.offsetSec)}` : null;
  };
  const highlight = (value: string) => {
    const q = query.trim();
    if (!q) return value;
    const parts = value.split(q);
    return parts.flatMap((part, index) => (index ? [<mark key={index}>{q}</mark>, part] : [part]));
  };

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.backLink} onClick={onBack}><ChevronLeft size={13} style={{ verticalAlign: -2 }} /> 새 분석 · 최근 목록</button>
      <div className={styles.resultHead}>
        <div className={styles.resultTitle}>
          <h3>{result.title}</h3>
          <p>{result.sourceRelativePath.normalize("NFC")} · 파일 {result.clips.length}개 · {formatClock(result.durationSec)}</p>
          <p style={{ marginTop: 7, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className={styles.chip}>{CONTENT_TYPE_LABEL[analysis.contentType]}</span>
            <span className={styles.chip}>블로그 › {BLOG_CATEGORY_LABEL[analysis.blogCategory]}</span>
          </p>
        </div>
        <div className={styles.exportRow}>
          <button type="button" className={photoStyles.primaryButton} onClick={() => exportAs("premiere")}><FileDown size={15} /> 프리미어로 보내기</button>
          <button type="button" className={photoStyles.secondaryButton} onClick={() => exportAs("fcp")}>파이널컷</button>
          <button type="button" className={photoStyles.secondaryButton} onClick={() => exportAs("capcut")}>캡컷 자막</button>
          <button type="button" className={photoStyles.mutedButton} onClick={() => exportAs("csv")}>마커 CSV</button>
        </div>
      </div>
      <div className={styles.exportOptions}>
        <span>마커에 함께 넣기</span>
        <label><input type="checkbox" checked={options.edits} onChange={(event) => setOptions({ ...options, edits: event.target.checked })} /> 편집 아이디어</label>
        <label><input type="checkbox" checked={options.cuts} onChange={(event) => setOptions({ ...options, cuts: event.target.checked })} /> 컷 후보</label>
        <label><input type="checkbox" checked={options.compliance} onChange={(event) => setOptions({ ...options, compliance: event.target.checked })} /> 의료광고 주의</label>
      </div>

      {analysis.qaFallback ? <p className={styles.notice}>AI 정리가 불완전해 목소리 크기·쉼·파일 바뀜만으로 Q&A를 나눴습니다. 질문 제목이 비어 있을 수 있어요.</p> : null}

      <div className={styles.searchRow}>
        <label className={styles.search}>
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="대본에서 찾기 (예: 환자, 개원, 사진)" />
        </label>
      </div>

      {query.trim() ? (
        <div className={styles.items}>
          {matches.length ? matches.map((segment) => (
            <div key={segment.id} className={styles.item} data-kind="qa">
              <span />
              <span className={styles.tc}>{tc(segment.start)}{where(segment.start) ? <small>{where(segment.start)}</small> : null}</span>
              <div className={styles.itemBody}><p className={styles.itemText}>{highlight(segment.text)}</p></div>
              <button type="button" className={styles.iconButton} aria-label="타임코드 복사" onClick={() => void copyTc(segment.start)}><Copy size={14} /></button>
            </div>
          )) : <div className={styles.empty}>"{query.trim()}"이(가) 나온 곳이 없습니다.</div>}
        </div>
      ) : (
        <>
          <div className={styles.filters}>
            <button type="button" className={styles.filter} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>전체 {rows.length}</button>
            {(Object.keys(KIND_LABEL) as MarkerKind[]).filter((kind) => counts[kind]).map((kind) => (
              <button key={kind} type="button" className={styles.filter} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>
                <i className={styles.dot} data-kind={kind} /> {KIND_LABEL[kind]} {counts[kind]}
              </button>
            ))}
          </div>
          <div className={styles.items}>
            {visible.map((row) => (
              <div key={row.key} className={styles.item} data-kind={row.kind}>
                <i className={styles.dot} data-kind={row.kind} />
                <span className={styles.tc}>
                  {tc(row.start)}
                  {row.kind === "qa" || row.kind === "reel" ? <small>→ {tc(row.end)}</small> : null}
                  <small>{[row.kind === "qa" || row.kind === "reel" ? `${Math.round(row.end - row.start)}초` : null, where(row.start)].filter(Boolean).join(" · ")}</small>
                </span>
                <div className={styles.itemBody}>
                  <p className={styles.itemTitle}>
                    {row.title}
                    {row.score ? <span className={styles.stars}>{"★".repeat(row.score)}</span> : null}
                    {row.qa ? <span className={styles.stars} title="활용도">{"★".repeat(row.qa.usefulness)}</span> : null}
                  </p>
                  {row.qa ? (
                    <p className={styles.question}>
                      <b>Q</b>{row.qa.question}
                      {row.qa.questionSource === "inferred" ? <span className={styles.badge} data-tone="warn" style={{ marginLeft: 6 }}>질문 추정</span> : null}
                    </p>
                  ) : null}
                  <p className={styles.itemText}>{row.text}</p>
                  {row.qa && row.qa.keyPoints.length ? <ul className={styles.points}>{row.qa.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul> : null}
                  {row.qa?.bestQuote ? <p className={styles.quote}>“{row.qa.bestQuote}”</p> : null}
                  {row.qa ? (
                    <>
                      <button type="button" className={styles.more} onClick={() => setOpenQa((current) => ({ ...current, [row.qa!.id]: !current[row.qa!.id] }))}>
                        {openQa[row.qa.id] ? "대본 접기" : "이 구간 대본 보기"}
                      </button>
                      {openQa[row.qa.id] ? (
                        <div className={styles.transcript}>
                          {result.segments.slice(row.qa.questionStartSeg ?? row.qa.answerStartSeg, row.qa.answerEndSeg + 1).map((segment) => (
                            <div key={segment.id} className={styles.line} data-quiet={segment.quiet}>
                              <span className={styles.tc}>{formatClock(segment.start)}</span>
                              <span>{segment.text}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <button type="button" className={styles.iconButton} aria-label="타임코드 복사" title="시작 타임코드 복사" onClick={() => void copyTc(row.start)}><Copy size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}
      <p className={styles.hint} style={{ marginTop: 14 }}><Play size={11} style={{ verticalAlign: -1 }} /> 타임코드는 프리미어 시퀀스(00_본편_Q&A마커) 기준입니다. 프리미어 타임코드 칸에 붙여넣으면 바로 이동합니다.</p>
    </div>
  );
}
