const OPTIONAL_CLIENT_DETAIL_COLUMNS = [
  "total_paid_amount",
  "available_points",
  "total_earned_points",
  "reward_tier",
] as const;

type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
};

export function isOptionalClientDetailColumnMissing(error: DatabaseErrorLike | null | undefined) {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  const referencesOptionalColumn = OPTIONAL_CLIENT_DETAIL_COLUMNS.some((column) => message.includes(column));
  const isMissingColumnError = error.code === "42703"
    || error.code === "PGRST204"
    || message.includes("does not exist")
    || message.includes("could not find");
  return referencesOptionalColumn && isMissingColumnError;
}

export function withClientDetailDefaults<T extends Record<string, unknown>>(client: T) {
  return {
    ...client,
    total_paid_amount: client.total_paid_amount ?? 0,
    available_points: client.available_points ?? 0,
    total_earned_points: client.total_earned_points ?? 0,
    reward_tier: client.reward_tier ?? "standard",
  };
}
