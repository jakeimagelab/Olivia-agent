import "server-only";

export const HIGGSFIELD_DEFAULT_BASE_URL = "https://api.higgsfield.ai";

export type HiggsfieldServerConfig = {
  credentials: string;
  baseUrl: string;
};

export class HiggsfieldConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HiggsfieldConfigurationError";
  }
}

function credentialsFromEnvironment(): string | undefined {
  // Open Higgsfield currently issues one complete API key. It must be passed
  // through unchanged after the `Authorization: Key` scheme is added by the
  // official platform client. Keep the former split-key variants only for
  // installations created before the single-key flow.
  const singleKey = [
    process.env.HF_API_KEY,
    process.env.HIGGSFIELD_API_KEY,
    process.env.HIGGSFIELD_API_CREDENTIALS,
    process.env.HF_CREDENTIALS,
    process.env.HF_KEY,
  ].find((value) => Boolean(value?.trim()))?.trim();
  if (singleKey) return singleKey;

  const legacyKey = process.env.HF_API_KEY_ID?.trim();
  const legacySecret = process.env.HF_API_SECRET?.trim();
  return legacyKey && legacySecret ? `${legacyKey}:${legacySecret}` : undefined;
}

export function hasHiggsfieldCredentials(): boolean {
  return Boolean(credentialsFromEnvironment());
}

export function getHiggsfieldServerConfig(): HiggsfieldServerConfig {
  const credentials = credentialsFromEnvironment();
  if (!credentials) {
    throw new HiggsfieldConfigurationError("Higgsfield API 연결이 필요합니다.");
  }
  return {
    credentials,
    baseUrl: process.env.HF_API_BASE_URL?.trim() || HIGGSFIELD_DEFAULT_BASE_URL,
  };
}
