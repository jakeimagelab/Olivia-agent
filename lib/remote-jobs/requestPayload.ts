import { normalizePersonSelectRequestPayload } from "./personSelectRequestPayload";
import { normalizePhotoBrowseRequestPayload } from "./photoBrowseRequestPayload";
import { normalizePhotoOperationRequestPayload } from "./photoOperationRequestPayload";
import { normalizeRawMatchCopyRequestPayload } from "./rawMatchCopyRequestPayload";
import type { RemoteJobAction } from "./requestValidation";
import { normalizeVideoRequestPayload } from "./videoRequestPayload";

type RemoteJobPayload = Record<string, unknown>;

export function normalizeRemoteJobRequestPayload(
  action: RemoteJobAction,
  requested: RemoteJobPayload,
): RemoteJobPayload {
  const photoBrowse = normalizePhotoBrowseRequestPayload(action, requested);
  if (photoBrowse !== null) return photoBrowse;

  const photoOperation = normalizePhotoOperationRequestPayload(action, requested);
  if (photoOperation !== null) return photoOperation;

  if (action === "PHOTO_RAW_MATCH_COPY") return normalizeRawMatchCopyRequestPayload(requested);

  const video = normalizeVideoRequestPayload(action, requested);
  if (video !== null) return video;

  const personSelect = normalizePersonSelectRequestPayload(action, requested);
  if (personSelect !== null) return personSelect;

  return requested;
}
