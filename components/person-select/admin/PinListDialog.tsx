"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

export type PinListPerson = {
  id: string;
  displayName: string;
  loginName: string;
  suggestedLoginName: string;
  canAutoNormalize: boolean;
  groupLabel: string;
  pin: string;
};

export function getNormalizablePinPeople(people: PinListPerson[]) {
  return people.filter((person) => person.canAutoNormalize && person.loginName !== person.suggestedLoginName);
}

export function PinListDialog({ eventId, onClose, onUpdated }: { eventId: string; onClose: () => void; onUpdated: () => Promise<void> }) {
  const [people, setPeople] = useState<PinListPerson[]>([]);
  const [eventTitle, setEventTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [normalizing, setNormalizing] = useState(false);
  const [error, setError] = useState("");

  const loadPins = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/person-select/${eventId}/exports/pins?format=json`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "비밀번호 목록을 불러오지 못했습니다.");
      setEventTitle(String(body.eventTitle ?? ""));
      setPeople(Array.isArray(body.people) ? body.people : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "비밀번호 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void loadPins(); }, [loadPins]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const normalizable = getNormalizablePinPeople(people);

  async function normalizeNames() {
    if (!normalizable.length) return;
    const preview = normalizable.slice(0, 5).map((person) => `${person.loginName} → ${person.suggestedLoginName}`).join("\n");
    const more = normalizable.length > 5 ? `\n외 ${normalizable.length - 5}명` : "";
    if (!window.confirm(`로그인 이름에서 직책을 제외할까요?\n\n${preview}${more}\n\n폴더명, 표시 이름, PIN, 사진과 선택 기록은 그대로 유지됩니다.`)) return;
    setNormalizing(true);
    setError("");
    try {
      const response = await fetch(`/api/person-select/${eventId}/login-names`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "로그인 이름을 변경하지 못했습니다.");
      await Promise.all([loadPins(), onUpdated()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로그인 이름을 변경하지 못했습니다.");
    } finally {
      setNormalizing(false);
    }
  }

  return <div className={styles.modalBackdrop} onClick={onClose}>
    <section className={styles.pinDialog} role="dialog" aria-modal="true" aria-labelledby="pin-list-title" onClick={(event) => event.stopPropagation()}>
      <div className={styles.modalTop}><div><p className={styles.eyebrow}>개인별 접속 정보</p><h2 id="pin-list-title">비밀번호 목록</h2><p>{eventTitle || "프로젝트"} · {people.length.toLocaleString()}명</p></div><button type="button" className={styles.weak} aria-label="닫기" onClick={onClose}><X size={20} /></button></div>
      {error ? <div className={styles.warning} role="alert">{error}</div> : null}
      {loading ? <div className={styles.modalState}>비밀번호 목록을 불러오는 중이에요.</div> : people.length ? <div className={styles.pinTableWrap}><table className={styles.pinTable}><thead><tr><th>폴더·표시 이름</th><th>로그인 이름</th><th>그룹</th><th>PIN</th></tr></thead><tbody>{people.map((person) => <tr key={person.id}><td>{person.displayName}</td><td><strong>{person.loginName}</strong>{person.loginName !== person.suggestedLoginName ? <small>추천 {person.suggestedLoginName}</small> : null}</td><td>{person.groupLabel || "—"}</td><td><code>{person.pin}</code></td></tr>)}</tbody></table></div> : <div className={styles.modalState}>등록된 사람이 없어요.</div>}
      <div className={styles.modalActions}>
        <a className={styles.secondary} href={`/api/person-select/${eventId}/exports/pins`}><Download size={15} />CSV 다운로드</a>
        {normalizable.length ? <button type="button" className={styles.primary} disabled={normalizing} onClick={() => void normalizeNames()}><RefreshCw size={15} />{normalizing ? "변경 중" : `직책 제외 적용 (${normalizable.length}명)`}</button> : null}
      </div>
    </section>
  </div>;
}
