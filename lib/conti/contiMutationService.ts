export type ContiShot = {
  id?: string;
  category: string;
  duration: string;
  location: string;
  cameraAngle: string;
  keyword: string;
  description: string;
  personnel: string;
  notes: string;
  color?: string;
};

export type ContiResult = { conti: ContiShot[]; checklist: unknown[]; schedule: unknown[] };

function normalized(value: unknown) {
  return String(value || "").toLowerCase().replace(/[\s/_-]+/g, "");
}

export function normalizeContiResult(value: unknown): ContiResult {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    // 배열 자체만 복사하고 변경되지 않은 shot 객체 참조는 유지한다. 각 mutation은 대상 행을
    // 새 객체로 교체하므로 불변성은 지키면서 React.memo 행이 다른 셀 편집에 재렌더되지 않는다.
    conti: Array.isArray(row.conti) ? row.conti.map((shot) => shot as ContiShot) : [],
    checklist: Array.isArray(row.checklist) ? [...row.checklist] : [],
    schedule: Array.isArray(row.schedule) ? [...row.schedule] : [],
  };
}

export function resolveContiShot(resultValue: unknown, options: { shotId?: string; selector?: string; position?: number }) {
  const result = normalizeContiResult(resultValue);
  const indexToken = options.shotId?.match(/^shot:(\d+)$/)?.[1];
  const position = options.position ?? (indexToken ? Number(indexToken) - 1 : undefined);
  if (options.shotId && !indexToken) {
    const exact = result.conti.flatMap((shot, index) => shot.id === options.shotId ? [{ shot, index }] : []);
    if (exact.length) return exact;
  }
  if (position !== undefined && result.conti[position]) return [{ shot: result.conti[position], index: position }];
  const query = normalized(options.selector);
  if (!query) return [];
  return result.conti.flatMap((shot, index) => {
    const target = [shot.category, shot.keyword, shot.description, shot.location, shot.personnel].map(normalized).join(" ");
    return target.includes(query) ? [{ shot, index }] : [];
  });
}

export function updateContiShot(resultValue: unknown, index: number, changes: Partial<ContiShot>) {
  const result = normalizeContiResult(resultValue);
  const before = result.conti[index];
  if (!before) throw new Error("콘티 컷을 찾지 못했어요.");
  const after = { ...before, ...changes };
  result.conti[index] = after;
  return { result, before, after };
}

export function addContiShots(resultValue: unknown, input: { items: Partial<ContiShot>[]; insertAfter?: number }) {
  const result = normalizeContiResult(resultValue);
  const items = input.items.slice(0, 20);
  const created: ContiShot[] = items.map((item, index) => ({
    id: crypto.randomUUID(),
    category: item.category || "",
    duration: item.duration || "",
    location: item.location || "",
    cameraAngle: item.cameraAngle || "",
    keyword: item.keyword || `${item.category || "컷"} ${index + 1}`,
    description: item.description || "",
    personnel: item.personnel || "",
    notes: item.notes || "",
  }));
  const insertAt = input.insertAfter === undefined ? result.conti.length : Math.min(result.conti.length, input.insertAfter + 1);
  result.conti.splice(insertAt, 0, ...created);
  return { result, created, insertAt };
}

export function removeContiShot(resultValue: unknown, index: number) {
  const result = normalizeContiResult(resultValue);
  const [removed] = result.conti.splice(index, 1);
  if (!removed) throw new Error("콘티 컷을 찾지 못했어요.");
  return { result, removed };
}

export function duplicateContiShot(resultValue: unknown, index: number) {
  const result = normalizeContiResult(resultValue);
  const source = result.conti[index];
  if (!source) throw new Error("복제할 콘티 컷을 찾지 못했어요.");
  const created = { ...source, id: crypto.randomUUID() };
  result.conti.splice(index + 1, 0, created);
  return { result, created };
}

export function reorderContiShot(resultValue: unknown, from: number, to: number) {
  const result = normalizeContiResult(resultValue);
  if (!result.conti[from]) throw new Error("이동할 콘티 컷을 찾지 못했어요.");
  const bounded = Math.max(0, Math.min(result.conti.length - 1, to));
  const [moved] = result.conti.splice(from, 1);
  result.conti.splice(bounded, 0, moved);
  return { result, moved, from, to: bounded };
}

export function estimateContiDuration(resultValue: unknown) {
  const result = normalizeContiResult(resultValue);
  const explicit = result.conti.reduce((sum, shot) => sum + (Number(shot.duration.match(/\d+/)?.[0]) || 0), 0);
  const estimated = explicit || result.conti.length * 10;
  return { shotCount: result.conti.length, minMinutes: Math.round(estimated * .9), maxMinutes: Math.round(estimated * 1.2), basedOnExplicitDuration: explicit > 0 };
}
