export type PrompterPeerStatus = "direct" | "cloud" | "connecting";

export type PrompterPeerSignal = {
  type: "ready" | "offer" | "answer" | "candidate";
  senderId: string;
  targetId?: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type BridgeOptions = {
  id: string;
  signal: (payload: PrompterPeerSignal) => void;
  onControl: (payload: unknown) => void;
  onMotion?: (payload: unknown) => void;
  onStatus: (status: PrompterPeerStatus) => void;
};

export type PrompterPeerBridge = {
  handleSignal: (signal: PrompterPeerSignal) => Promise<void>;
  sendControl: (payload: unknown) => boolean;
  sendMotion: (payload: unknown) => boolean;
  announce?: () => void;
  close: () => void;
};

const PEER_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function sendJson(channel: RTCDataChannel | null, payload: unknown) {
  if (!channel || channel.readyState !== "open") return false;
  try {
    channel.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function parseMessage(event: MessageEvent, receiver: (payload: unknown) => void) {
  try {
    receiver(JSON.parse(String(event.data)));
  } catch {
    // 잘못된 직접 연결 패킷은 Supabase fallback 흐름에 영향을 주지 않고 폐기한다.
  }
}

export function createPrompterHostBridge(options: BridgeOptions): PrompterPeerBridge {
  let peer: RTCPeerConnection | null = null;
  let control: RTCDataChannel | null = null;
  let motion: RTCDataChannel | null = null;
  let remoteId = "";
  let candidateQueue: RTCIceCandidateInit[] = [];

  const closePeer = () => {
    control?.close();
    motion?.close();
    peer?.close();
    control = null;
    motion = null;
    peer = null;
    candidateQueue = [];
  };

  const watchChannel = (channel: RTCDataChannel, receiver: (payload: unknown) => void) => {
    channel.onopen = () => options.onStatus("direct");
    channel.onclose = () => options.onStatus("cloud");
    channel.onerror = () => options.onStatus("cloud");
    channel.onmessage = (event) => parseMessage(event, receiver);
  };

  const startOffer = async (targetId: string) => {
    if (typeof RTCPeerConnection === "undefined") {
      options.onStatus("cloud");
      return;
    }
    closePeer();
    remoteId = targetId;
    options.onStatus("connecting");
    peer = new RTCPeerConnection(PEER_CONFIG);
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        options.signal({
          type: "candidate",
          senderId: options.id,
          targetId: remoteId,
          candidate: event.candidate.toJSON(),
        });
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer?.connectionState === "connected") options.onStatus("direct");
      if (peer?.connectionState === "failed" || peer?.connectionState === "disconnected" || peer?.connectionState === "closed") {
        options.onStatus("cloud");
      }
    };
    control = peer.createDataChannel("control", { ordered: true });
    motion = peer.createDataChannel("motion", { ordered: false, maxRetransmits: 0 });
    watchChannel(control, options.onControl);
    watchChannel(motion, options.onMotion ?? options.onControl);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    options.signal({ type: "offer", senderId: options.id, targetId, description: offer });
  };

  const handleSignal = async (signal: PrompterPeerSignal) => {
    if (signal.senderId === options.id) return;
    if (signal.type === "ready") {
      await startOffer(signal.senderId);
      return;
    }
    if (signal.targetId !== options.id || signal.senderId !== remoteId || !peer) return;
    if (signal.type === "answer" && signal.description) {
      await peer.setRemoteDescription(signal.description);
      for (const candidate of candidateQueue) await peer.addIceCandidate(candidate);
      candidateQueue = [];
    } else if (signal.type === "candidate" && signal.candidate) {
      if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
      else candidateQueue.push(signal.candidate);
    }
  };

  return {
    handleSignal,
    sendControl: (payload) => sendJson(control, payload),
    sendMotion: (payload) => sendJson(motion, payload),
    close: closePeer,
  };
}

export function createPrompterRemoteBridge(options: BridgeOptions): PrompterPeerBridge {
  let peer: RTCPeerConnection | null = null;
  let control: RTCDataChannel | null = null;
  let motion: RTCDataChannel | null = null;
  let hostId = "";
  let candidateQueue: RTCIceCandidateInit[] = [];

  const announce = () => {
    options.onStatus("connecting");
    options.signal({ type: "ready", senderId: options.id });
  };

  const closePeer = () => {
    control?.close();
    motion?.close();
    peer?.close();
    control = null;
    motion = null;
    peer = null;
    candidateQueue = [];
  };

  const attachChannel = (channel: RTCDataChannel) => {
    if (channel.label === "motion") motion = channel;
    else control = channel;
    channel.onopen = () => options.onStatus("direct");
    channel.onmessage = (event) => parseMessage(event, channel.label === "motion" ? options.onMotion ?? options.onControl : options.onControl);
    channel.onclose = () => options.onStatus("cloud");
    channel.onerror = () => options.onStatus("cloud");
  };

  const handleSignal = async (signal: PrompterPeerSignal) => {
    if (signal.senderId === options.id || (signal.targetId && signal.targetId !== options.id)) return;
    if (signal.type === "offer" && signal.description) {
      if (typeof RTCPeerConnection === "undefined") {
        options.onStatus("cloud");
        return;
      }
      const earlyCandidates = signal.senderId === hostId ? candidateQueue : [];
      closePeer();
      hostId = signal.senderId;
      candidateQueue = earlyCandidates;
      options.onStatus("connecting");
      peer = new RTCPeerConnection(PEER_CONFIG);
      peer.ondatachannel = (event) => attachChannel(event.channel);
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          options.signal({
            type: "candidate",
            senderId: options.id,
            targetId: hostId,
            candidate: event.candidate.toJSON(),
          });
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer?.connectionState === "connected") options.onStatus("direct");
        if (peer?.connectionState === "failed" || peer?.connectionState === "disconnected" || peer?.connectionState === "closed") {
          options.onStatus("cloud");
        }
      };
      await peer.setRemoteDescription(signal.description);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      options.signal({ type: "answer", senderId: options.id, targetId: hostId, description: answer });
      for (const candidate of candidateQueue) await peer.addIceCandidate(candidate);
      candidateQueue = [];
    } else if (signal.type === "candidate" && signal.candidate) {
      if (!peer) {
        hostId = signal.senderId;
        candidateQueue.push(signal.candidate);
        return;
      }
      if (signal.senderId !== hostId) return;
      if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
      else candidateQueue.push(signal.candidate);
    }
  };

  return {
    handleSignal,
    sendControl: (payload) => sendJson(control, payload),
    sendMotion: (payload) => sendJson(motion, payload),
    announce,
    close: closePeer,
  };
}
