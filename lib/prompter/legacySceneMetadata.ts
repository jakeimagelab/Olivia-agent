const SHOT_MARKER = "__PROMPTER_SHOT_V1__";
const GESTURE_PREFIX = "__PROMPTER_GESTURES_V1__:";

export function decodeLegacySceneMetadata(value: unknown) {
  const raw = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const speakerMap = raw.filter((item) => item !== SHOT_MARKER && !item.startsWith(GESTURE_PREFIX));
  const encodedGestures = raw.find((item) => item.startsWith(GESTURE_PREFIX))?.slice(GESTURE_PREFIX.length);
  let gestureMap: string[] = [];
  if (encodedGestures) {
    try {
      const parsed = JSON.parse(decodeURIComponent(encodedGestures));
      if (Array.isArray(parsed)) gestureMap = parsed.map((item) => String(item || ""));
    } catch { /* 손상된 구형 메타데이터는 화자 정보에 영향 없이 무시한다. */ }
  }
  return { speakerMap, isShot: raw.includes(SHOT_MARKER), gestureMap };
}

export function encodeLegacySceneMetadata(speakerMap: unknown, isShot: boolean, gestureMap: unknown) {
  const clean = decodeLegacySceneMetadata(speakerMap).speakerMap;
  const gestures = Array.isArray(gestureMap) ? gestureMap.map((item) => String(item || "")) : [];
  if (isShot) clean.push(SHOT_MARKER);
  if (gestures.some((item) => item.trim())) {
    clean.push(`${GESTURE_PREFIX}${encodeURIComponent(JSON.stringify(gestures))}`);
  }
  return clean;
}

export function normalizeSceneMetadata(row: Record<string, unknown>) {
  const legacy = decodeLegacySceneMetadata(row.speaker_map);
  const storedGestures = Array.isArray(row.gesture_map) ? row.gesture_map.map((item) => String(item || "")) : [];
  return {
    ...row,
    speaker_map: legacy.speakerMap,
    is_shot: Boolean(row.is_shot) || legacy.isShot,
    gesture_map: storedGestures.some((item) => item.trim()) ? storedGestures : legacy.gestureMap,
  };
}
