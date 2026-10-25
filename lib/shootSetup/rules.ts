export type ShootType = "scene" | "group" | "profile" | "interior";
export type ProfileStyle = "studio" | "basic";

export type ShootSetupInput = {
  shootTypes: ShootType[];
  hasVideo: boolean;
  profileStyle: ProfileStyle;
};

export type CameraRole = {
  name: "Sony a7R5" | "Sony a7M4" | "Canon 5DMK4";
  role: string;
  prefix: "R5K" | "DSC" | "_AK";
  used: boolean;
};

export type SetupEquipment = {
  name: string;
  quantity: number;
  note?: string;
};

export type ShootSetup = {
  camera: string | null;
  lenses: SetupEquipment[];
  lights: SetupEquipment[];
  stands: SetupEquipment[];
  gimbals: SetupEquipment[];
  trigger: SetupEquipment | SetupEquipment[] | null;
};

export type ShootSetupKind = ShootType | "video";
export type ShootSetups = Partial<Record<ShootSetupKind, ShootSetup>>;
export type PackingItem = { name: string; quantity: number };
export type SetupEquipmentCategory = "CAMERA" | "LENS" | "LIGHT" | "STAND" | "TRIPOD" | "SLIDER" | "GIMBAL" | "TRIGGER" | "BATTERY" | "STORAGE" | "ETC";

export const EQUIPMENT_CATEGORY_ORDER: SetupEquipmentCategory[] = [
  "CAMERA", "LENS", "LIGHT", "STAND", "TRIPOD", "SLIDER", "GIMBAL", "TRIGGER", "BATTERY", "STORAGE", "ETC",
];

export const SETUP_CATEGORY_LABEL: Record<SetupEquipmentCategory, string> = {
  CAMERA: "카메라", LENS: "렌즈", LIGHT: "조명", STAND: "스탠드", TRIPOD: "삼각대", SLIDER: "슬라이더", GIMBAL: "짐벌",
  TRIGGER: "동조기", BATTERY: "배터리", STORAGE: "저장장치", ETC: "기타",
};

export const SHOOT_SETUP_LABEL: Record<ShootSetupKind, string> = {
  scene: "연출",
  group: "단체사진",
  profile: "프로필",
  interior: "인테리어",
  video: "영상",
};

export const EQUIPMENT_SORT_ORDER = [
  "Sony a7R5", "Sony a7M4", "Canon 5DMK4", "Canon 16-35mm L", "Canon 24-70mm L",
  "Sony 35mm GM", "Sony 85mm GM", "Sony 24-70mm GM2", "Sony 135mm GM", "Profoto A10",
  "Profoto B10x", "Rimelight i6 TTL", "Rimelight i4 TTL", "Godox E300", "Silver Stand",
  "Black Aurora", "Sirui for Movie", "Sirui for Photo", "E700", "Ronin 4 Mini",
  "Profoto Connect Pro", "Profoto Connect for Sony", "Profoto Connect for Canon", "TS-5 for Canon",
  "TS-5 for Sony", "Sony Battery", "Canon Battery", "프로포토 A10 배터리", "프로포토 B10 배터리",
  "Lexar CFex A type 80Gb", "Lexar SD 64Gb", "Lexar SD 32Gb", "Sony SD 128Gb", "Sony SD 64Gb",
  "아이패드",
] as const;

const CATEGORY_BY_NAME: Record<string, SetupEquipmentCategory> = Object.fromEntries([
  ...["Sony a7R5", "Sony a7M4", "Canon 5DMK4"].map((name) => [name, "CAMERA"]),
  ...["Canon 16-35mm L", "Canon 24-70mm L", "Sony 35mm GM", "Sony 85mm GM", "Sony 24-70mm GM2", "Sony 135mm GM"].map((name) => [name, "LENS"]),
  ...["Profoto A10", "Profoto B10x", "Rimelight i6 TTL", "Rimelight i4 TTL", "Godox E300"].map((name) => [name, "LIGHT"]),
  ...["Silver Stand", "Black Aurora"].map((name) => [name, "STAND"]),
  ...["Sirui for Movie", "Sirui for Photo"].map((name) => [name, "TRIPOD"]),
  ["E700", "SLIDER"],
  ["Ronin 4 Mini", "GIMBAL"],
  ...["Profoto Connect Pro", "Profoto Connect for Sony", "Profoto Connect for Canon", "TS-5 for Canon", "TS-5 for Sony"].map((name) => [name, "TRIGGER"]),
  ...["Sony Battery", "Canon Battery", "프로포토 A10 배터리", "프로포토 B10 배터리"].map((name) => [name, "BATTERY"]),
  ...["Lexar CFex A type 80Gb", "Lexar SD 64Gb", "Lexar SD 32Gb", "Sony SD 128Gb", "Sony SD 64Gb"].map((name) => [name, "STORAGE"]),
  ["아이패드", "ETC"],
] as Array<[string, SetupEquipmentCategory]>);

export function getSetupEquipmentCategory(name: string): SetupEquipmentCategory {
  return CATEGORY_BY_NAME[name] ?? "ETC";
}

export const STAFF_TASKS = [
  "조명 들기",
  "배터리 교체",
  "렌즈 교체",
  "아이패드로 콘티 체크",
  "기타 서포트",
  "메모리 백업은 스텝 일이 아닙니다",
] as const;

export const EQUIPMENT_CONFUSION_NOTES = [
  "렉사 메모리는 소니용",
  "소니 SD는 캐논용",
  "A10 배터리 2개 사용 1개 충전",
  "캐논 배터리 세로그립에 2개",
  "아이패드 자주 충전",
  "Connect for Sony는 여분 · 보조",
  "Connect Pro는 소니에만 장착 — 캐논 프로필(기본형)은 Connect for Canon을 캐논에 끼우고 Connect Pro로 컨트롤",
] as const;

const ref = (name: string, quantity = 1, note?: string): SetupEquipment => ({ name, quantity, ...(note ? { note } : {}) });

export function getCameraRoles(input: ShootSetupInput): CameraRole[] {
  const sonyUsed = input.hasVideo || input.shootTypes.includes("scene") || input.shootTypes.includes("group");
  const canonUsed = input.shootTypes.includes("profile") || input.shootTypes.includes("interior");
  return [
    { name: "Sony a7R5", role: sonyUsed ? (input.hasVideo ? "영상 메인" : "사진 메인") : "오늘 안 씀", prefix: "R5K", used: sonyUsed },
    { name: "Sony a7M4", role: sonyUsed ? (input.hasVideo ? "사진 메인" : "직원 스케치컷") : "오늘 안 씀", prefix: "DSC", used: sonyUsed },
    { name: "Canon 5DMK4", role: canonUsed ? "프로필 · 인테리어" : "오늘 안 씀", prefix: "_AK", used: canonUsed },
  ];
}

export function getSetups(input: ShootSetupInput): ShootSetups {
  const photoSony = input.hasVideo ? "Sony a7M4" : "Sony a7R5";
  const triggerMount = input.hasVideo ? "Sony a7M4" : "Sony a7R5";
  const setups: ShootSetups = {};

  if (input.shootTypes.includes("scene")) {
    setups.scene = {
      camera: photoSony,
      lenses: [ref("Sony 35mm GM", 1, "기본"), ref("Sony 85mm GM", 1, "클로즈업"), ref("Sony 24-70mm GM2", 1, "좁은 공간 · 와이드")],
      lights: [ref("Profoto A10", 2, "기본"), ref("Profoto B10x", 2, "사람이 많을 때")],
      stands: [ref("Silver Stand", 2, "A10"), ref("Black Aurora", 2, "B10x · 보조")],
      gimbals: [],
      trigger: ref("Profoto Connect Pro", 1, triggerMount),
    };
  }
  if (input.shootTypes.includes("group")) {
    setups.group = {
      camera: photoSony,
      lenses: [],
      lights: [ref("Profoto B10x", 2)],
      stands: [ref("Black Aurora", 2)],
      gimbals: [],
      trigger: ref("Profoto Connect Pro", 1, triggerMount),
    };
  }
  if (input.shootTypes.includes("profile")) {
    setups.profile = input.profileStyle === "studio"
      ? {
          camera: "Canon 5DMK4",
          lenses: [ref("Canon 24-70mm L")],
          lights: [ref("Rimelight i6 TTL", 2), ref("Rimelight i4 TTL", 1)],
          stands: [ref("Black Aurora", 2), ref("Silver Stand", 1, "두꺼운 것")],
          gimbals: [],
          trigger: ref("TS-5 for Canon"),
        }
      : {
          camera: "Canon 5DMK4",
          lenses: [ref("Canon 24-70mm L")],
          lights: [ref("Profoto B10x", 2)],
          stands: [ref("Black Aurora", 2), ref("Silver Stand", 1, "두꺼운 것")],
          gimbals: [],
          trigger: [
            ref("Profoto Connect for Canon", 1, "캐논에 장착"),
            ref("Profoto Connect Pro", 1, "컨트롤"),
          ],
        };
  }
  if (input.shootTypes.includes("interior")) {
    setups.interior = {
      camera: "Canon 5DMK4",
      lenses: [ref("Canon 16-35mm L")],
      lights: [],
      stands: [],
      gimbals: [],
      trigger: null,
    };
  }
  if (input.hasVideo) {
    setups.video = {
      camera: "Sony a7R5",
      lenses: [ref("Sony 24-70mm GM2")],
      lights: [ref("Godox E300")],
      stands: [],
      gimbals: [ref("Ronin 4 Mini")],
      trigger: null,
    };
  }
  return setups;
}

export function getPackingList(input: ShootSetupInput): PackingItem[] {
  const quantities = new Map<string, number>();
  const add = (name: string, quantity: number) => quantities.set(name, Math.max(quantities.get(name) ?? 0, quantity));
  const sonyUsed = input.hasVideo || input.shootTypes.includes("scene") || input.shootTypes.includes("group");
  const canonUsed = input.shootTypes.includes("profile") || input.shootTypes.includes("interior");

  if (sonyUsed) {
    add("Sony a7R5", 1); add("Sony a7M4", 1); add("Sony Battery", 4); add("Lexar CFex A type 80Gb", 2);
    add("Profoto Connect Pro", 1); add("Profoto Connect for Sony", 1);
  }
  if (input.shootTypes.includes("scene")) {
    add("Sony 35mm GM", 1); add("Sony 85mm GM", 1); add("Sony 24-70mm GM2", 1);
    add("Profoto A10", 2); add("프로포토 A10 배터리", 3); add("Silver Stand", 2);
  }
  if (input.shootTypes.includes("group")) {
    add("Profoto B10x", 2); add("프로포토 B10 배터리", 2); add("Black Aurora", 2);
  }
  if (canonUsed) {
    add("Canon 5DMK4", 1); add("Canon Battery", 3); add("Sony SD 128Gb", 1); add("Sony SD 64Gb", 1);
  }
  if (input.shootTypes.includes("profile")) {
    add("Canon 24-70mm L", 1); add("Black Aurora", 2); add("Silver Stand", 1);
    if (input.profileStyle === "studio") {
      add("Rimelight i6 TTL", 2); add("Rimelight i4 TTL", 1); add("TS-5 for Canon", 1);
    } else {
      add("Profoto B10x", 2); add("프로포토 B10 배터리", 2);
      add("Profoto Connect Pro", 1); add("Profoto Connect for Canon", 1);
    }
  }
  if (input.shootTypes.includes("interior")) add("Canon 16-35mm L", 1);
  if (input.hasVideo) {
    add("Sony a7R5", 1); add("Ronin 4 Mini", 1); add("Sony 24-70mm GM2", 1); add("Godox E300", 1);
  }
  if (input.shootTypes.length > 0 || input.hasVideo) add("아이패드", 1);

  return EQUIPMENT_SORT_ORDER.flatMap((name) => {
    const quantity = quantities.get(name);
    return quantity ? [{ name, quantity }] : [];
  });
}

export function setupSummary(setup: ShootSetup | undefined): string {
  if (!setup) return "";
  const format = (item: SetupEquipment) => `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""}${item.note ? ` ${item.note}` : ""}`;
  const triggerSummary = Array.isArray(setup.trigger)
    ? setup.trigger.map((item) => item.name.replace(/^Profoto /, "")).join(" + ")
    : setup.trigger
      ? format(setup.trigger)
      : null;
  return [
    setup.camera,
    ...setup.lenses.map(format),
    ...setup.lights.map(format),
    ...setup.stands.map(format),
    ...setup.gimbals.map(format),
    triggerSummary,
  ].filter(Boolean).join(" · ");
}
