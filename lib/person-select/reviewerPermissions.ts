export function canPersonSelectReviewerFinalize(reviewer: {
  is_legacy?: boolean | null;
  can_finalize?: boolean | null;
}) {
  if (typeof reviewer.can_finalize === "boolean") return reviewer.can_finalize;
  return reviewer.is_legacy === true;
}
