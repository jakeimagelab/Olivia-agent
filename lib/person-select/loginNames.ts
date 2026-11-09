import { derivePersonLoginName, normalizeLoginName } from "./folderRules";

export type PersonLoginNameRow = {
  id: string;
  display_name: string;
  login_name: string;
};

export type PersonLoginNameUpdate = {
  id: string;
  displayName: string;
  currentLoginName: string;
  nextLoginName: string;
};

export type PersonLoginCandidate = Pick<PersonLoginNameRow, "display_name" | "login_name">;

/**
 * 예전 프로젝트에 직책이 포함된 login_name이 남아 있어도 이름만으로 로그인할 수 있게 한다.
 * 관리자가 직접 지정한 기존 로그인 이름도 계속 허용한다.
 */
export function matchesPersonLoginName(person: PersonLoginCandidate, input: string) {
  const normalizedInput = normalizeLoginName(input);
  if (!normalizedInput) return false;
  return normalizeLoginName(person.login_name) === normalizedInput
    || derivePersonLoginName(person.display_name) === normalizedInput;
}

export function planPersonLoginNameUpdates(rows: PersonLoginNameRow[]) {
  const updates: PersonLoginNameUpdate[] = [];
  const skippedCustom: PersonLoginNameUpdate[] = [];

  for (const row of rows) {
    const currentLoginName = normalizeLoginName(row.login_name);
    const defaultLoginName = normalizeLoginName(row.display_name);
    const nextLoginName = derivePersonLoginName(row.display_name);
    if (!nextLoginName || currentLoginName === nextLoginName) continue;
    const item = { id: row.id, displayName: row.display_name, currentLoginName, nextLoginName };
    if (currentLoginName !== defaultLoginName) skippedCustom.push(item);
    else updates.push(item);
  }

  const effectiveNames = new Map<string, PersonLoginNameRow[]>();
  const updatesById = new Map(updates.map((item) => [item.id, item.nextLoginName]));
  for (const row of rows) {
    const effective = updatesById.get(row.id) ?? normalizeLoginName(row.login_name);
    const matches = effectiveNames.get(effective) ?? [];
    matches.push(row);
    effectiveNames.set(effective, matches);
  }
  const conflicts = [...effectiveNames.entries()]
    .filter(([, matches]) => matches.length > 1 && matches.some((row) => updatesById.has(row.id)))
    .map(([loginName, matches]) => ({ loginName, people: matches.map((row) => ({ id: row.id, displayName: row.display_name })) }));

  return { updates, skippedCustom, conflicts };
}
