import type { RawIndex, SelectMatchPreflight } from "@/lib/selectMatch/rawIndexTypes";

export function computePreflight(selectedNames: Set<string>, rawIndex: RawIndex): SelectMatchPreflight {
  const selArr = Array.from(selectedNames);
  const willMatch = selArr.filter((basename) => (rawIndex.get(basename)?.length ?? 0) > 0).length;
  return {
    rawFound: Array.from(rawIndex.values()).reduce((sum, entries) => sum + entries.length, 0),
    willMatch,
    willMiss: selArr.length - willMatch,
    rawSamples: Array.from(rawIndex.keys()).slice(0, 4),
    jpgSamples: selArr.slice(0, 4),
  };
}
