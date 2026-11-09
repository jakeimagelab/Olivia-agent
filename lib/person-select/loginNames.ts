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
