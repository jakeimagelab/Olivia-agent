export interface SceneMergeCandidate {
  id: string;                    // "merge_SceneXX_SceneYY" | "split_SceneXX_SceneYY"
  fromFolderName: string;        // scene A .folderName (stable key)
  toFolderName: string;          // scene B .folderName
  fromDisplayName: string;       // scene A .editedName (for display)
  toDisplayName: string;
  fromSceneType: string;
  toSceneType: string;
  mergeScore: number;            // 0–1, higher = more likely same scene
  transitionStrength: number;    // 0–1, higher = more likely different scene
  recommendedAction: "merge" | "keep_split";
  reason: string;
  matchedSignals: string[];
  blockedSignals: string[];
}

export type MergeDecision = {
  candidateId: string;
  userAction: "merge" | "keep_split";
  fromFolderName: string;
  toFolderName: string;
  fromSceneType: string;
  toSceneType: string;
  mergeScore: number;
  matchedSignals: string[];
  blockedSignals: string[];
  recommendedAction: "merge" | "keep_split";
};
