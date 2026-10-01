export type RemotePhotoFailureDisplay = {
  title: string;
  detail: string;
};

function messageOf(error: string | null | undefined): string {
  return error?.trim() || "Mac Studio 작업에 실패했습니다.";
}

function destinationFrom(message: string): string | null {
  const separator = message.lastIndexOf(": ");
  if (separator < 0) return null;
  const destination = message.slice(separator + 2).trim();
  return destination || null;
}

/**
 * Worker가 전달한 실패 원문을 사용자에게 원인 자체로 보여준다.
 * 원인 없는 "작업 실패" 제목으로 덮어쓰지 않는다.
 */
export function describeRemotePhotoFailure(error: string | null | undefined): RemotePhotoFailureDisplay {
  const message = messageOf(error);
  const isExistingWorkFolder = message.includes("작업 목적지가 이미 존재")
    || message.includes("작업본 폴더가 이미 생성");

  if (isExistingWorkFolder) {
    const destination = destinationFrom(message);
    const isAgentstation = destination?.includes("Agentstation") ?? false;
    return {
      title: isAgentstation
        ? "Agentstation에 작업 폴더가 이미 생성되어 있습니다."
        : "작업본 폴더가 이미 생성되어 있습니다.",
      detail: destination
        ? `새 복사를 시작하지 않았습니다. 작업본: ${destination}`
        : message,
    };
  }

  return { title: "Mac Studio 작업을 완료하지 못했습니다.", detail: message };
}
