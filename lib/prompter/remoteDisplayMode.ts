export type RemoteDisplayMode = "remote" | "mirror";

export const REMOTE_DISPLAY_MODE_STORAGE_KEY = "prompter-remote-display-mode-v1";

type DeviceSignals = {
  userAgent: string;
  maxTouchPoints: number;
  screenWidth: number;
  screenHeight: number;
};

export function recommendRemoteDisplayMode({ userAgent, maxTouchPoints, screenWidth, screenHeight }: DeviceSignals): RemoteDisplayMode {
  const isIPad = /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  const isAndroidTablet = /Android/i.test(userAgent) && !/Mobile/i.test(userAgent);
  const hasTabletSize = maxTouchPoints > 0 && Math.min(screenWidth, screenHeight) >= 600;
  return isIPad || isAndroidTablet || hasTabletSize ? "mirror" : "remote";
}

export function isRemoteDisplayMode(value: unknown): value is RemoteDisplayMode {
  return value === "remote" || value === "mirror";
}
