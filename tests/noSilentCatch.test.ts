import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOTS = ["app", "components", "lib", "scripts"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const USER_DIRTY_FILES = new Set([
  "app/api/olivia/v2/stream/route.ts",
  "app/api/photo-scene-boundary-analyze/route.ts",
  "app/api/worker/next/route.ts",
  "components/olivia-tablet/TabletHome.tsx",
  "lib/hermes/mcp/oliviaToolBridge.ts",
  "lib/photo-classifier/constants.ts",
  "lib/photo-classifier/node/photoClassifyWork.ts",
  "lib/store/usePhotoClassificationChatStore.ts",
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

function extension(path: string): string {
  return path.endsWith(".tsx") ? ".tsx" : path.endsWith(".ts") ? ".ts" : "";
}

describe("silent catch regression", () => {
  it("does not silently discard empty catch blocks", () => {
    const emptyCatch = /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?\}/g;
    const emptyPromiseCatch = /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?\}\s*\)/g;
    const matches: string[] = [];

    for (const root of SOURCE_ROOTS) {
      for (const path of sourceFiles(root)) {
        const repoPath = relative(process.cwd(), path);
        if (!EXTENSIONS.has(extension(path)) || USER_DIRTY_FILES.has(repoPath)) continue;
        const source = readFileSync(path, "utf8");
        if (emptyCatch.test(source) || emptyPromiseCatch.test(source)) matches.push(repoPath);
        emptyCatch.lastIndex = 0;
        emptyPromiseCatch.lastIndex = 0;
      }
    }

    expect(matches).toEqual([]);
  });
});
