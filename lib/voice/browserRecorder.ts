export type RecorderCallbacks = {
  onWaveform?: (values: number[]) => void;
  onSpeakerHint?: (speaker: string, confidence: number) => void;
  onStateWarning?: (message: string) => void;
};

export const RECORDER_MIME_CANDIDATES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

export function preferredMimeType(recorderType: typeof MediaRecorder | undefined = globalThis.MediaRecorder) {
  if (typeof recorderType === "undefined") return "";
  return RECORDER_MIME_CANDIDATES.find((type) => recorderType.isTypeSupported(type)) ?? "";
}

export function analyzeWaveformFrame(
  timeData: Uint8Array,
  previous: number[] = Array(48).fill(0.05),
  previousCeiling = 0.025,
): { values: number[]; rms: number; ceiling: number } {
  const bars = 48;
  if (timeData.length === 0) {
    return { values: Array(bars).fill(0.05), rms: 0, ceiling: previousCeiling };
  }

  let rmsTotal = 0;
  for (let i = 0; i < timeData.length; i += 1) {
    const normalized = (timeData[i] - 128) / 128;
    rmsTotal += normalized * normalized;
  }
  const rms = Math.sqrt(rmsTotal / timeData.length);

  // iPhone microphone input can be much quieter than desktop input. A slowly
  // decaying adaptive ceiling keeps quiet speech visible without animating
  // digital silence into a fake waveform.
  const ceiling = Math.max(0.015, rms * 2.2, previousCeiling * 0.96);
  const silent = rms < 0.0035;
  const values = Array.from({ length: bars }, (_, bar) => {
    const start = Math.floor((bar * timeData.length) / bars);
    const end = Math.max(start + 1, Math.floor(((bar + 1) * timeData.length) / bars));
    let localTotal = 0;
    let localPeak = 0;

    for (let i = start; i < Math.min(end, timeData.length); i += 1) {
      const amplitude = Math.abs((timeData[i] - 128) / 128);
      localTotal += amplitude * amplitude;
      localPeak = Math.max(localPeak, amplitude);
    }

    const sampleCount = Math.max(1, Math.min(end, timeData.length) - start);
    const localRms = Math.sqrt(localTotal / sampleCount);
    const target = silent
      ? 0.05
      : Math.max(0.06, Math.min(1, ((localRms * 0.72) + (localPeak * 0.28)) / ceiling));
    const previousValue = Number.isFinite(previous[bar]) ? previous[bar] : 0.05;
    return Math.max(0.05, Math.min(1, previousValue * 0.52 + target * 0.48));
  });

  return { values, rms, ceiling };
}

export class OliviaBrowserRecorder {
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private chunks: Blob[] = [];
  private raf?: number;
  private paused = false;
  private speakerProfiles: number[][] = [];
  private currentSpeaker = -1;
  private candidateSpeaker = -1;
  private candidateStartedAt = 0;
  private waveformCeiling = 0.025;
  private smoothedWaveform: number[] = Array(48).fill(0.05);
  public mimeType = "";

  constructor(private callbacks: RecorderCallbacks = {}) {}

  get state(): RecordingState | "idle" {
    return this.recorder?.state ?? "idle";
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("이 브라우저에서는 음성 녹음을 지원하지 않습니다.");
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48_000 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "OverconstrainedError") {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        throw error;
      }
    }

    try {
      this.mimeType = preferredMimeType();
      this.recorder = new MediaRecorder(this.stream, {
        ...(this.mimeType ? { mimeType: this.mimeType } : {}),
        audioBitsPerSecond: 48_000,
      });

      this.context = new AudioContext();
      if (this.context.state === "suspended") await this.context.resume();
      const source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.72;
      source.connect(this.analyser);

      this.chunks = [];
      this.paused = false;
      this.speakerProfiles = [];
      this.currentSpeaker = -1;
      this.candidateSpeaker = -1;
      this.waveformCeiling = 0.025;
      this.smoothedWaveform = Array(48).fill(0.05);
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder.onerror = () => {
        this.callbacks.onStateWarning?.("브라우저 녹음기에 문제가 발생했습니다. 녹음을 종료해 저장해주세요.");
      };
      this.recorder.start(1_000);
      this.renderAudioState();
    } catch (error) {
      this.cleanupAudioGraph();
      this.recorder = undefined;
      throw error;
    }
  }

  pause() {
    if (this.recorder?.state !== "recording") return;
    this.recorder.requestData();
    this.recorder.pause();
    this.paused = true;
    this.smoothedWaveform = Array(48).fill(0.05);
    this.callbacks.onWaveform?.(this.smoothedWaveform);
  }

  resume() {
    if (this.recorder?.state !== "paused") return;
    this.recorder.resume();
    this.paused = false;
    if (this.context?.state === "suspended") void this.context.resume();
  }

  requestData() {
    if (this.recorder?.state === "recording") this.recorder.requestData();
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        reject(new Error("Recorder가 시작되지 않았습니다."));
        return;
      }

      const recorder = this.recorder;
      recorder.onstop = () => {
        this.cleanupAudioGraph();
        resolve(new Blob(this.chunks, {
          type: recorder.mimeType || this.mimeType || "audio/webm",
        }));
      };
      recorder.stop();
    });
  }

  private cleanupAudioGraph() {
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    this.raf = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    void this.context?.close();
    this.context = undefined;
    this.analyser = undefined;
    this.paused = false;
  }

  private renderAudioState = () => {
    if (!this.analyser) return;
    if (this.paused) {
      this.raf = requestAnimationFrame(this.renderAudioState);
      return;
    }

    const timeData = new Uint8Array(this.analyser.frequencyBinCount);
    const frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(timeData);
    this.analyser.getByteFrequencyData(frequencyData);

    const frame = analyzeWaveformFrame(timeData, this.smoothedWaveform, this.waveformCeiling);
    this.smoothedWaveform = frame.values;
    this.waveformCeiling = frame.ceiling;
    this.callbacks.onWaveform?.(frame.values);

    // 화면용 추정일 뿐이다. 저장되는 최종 화자는 종료 후 diarization 결과가 결정한다.
    if (frame.rms > 0.012) {
      const signature = this.createSignature(frequencyData);
      const { index, distance } = this.closestProfile(signature);
      let estimated = index;
      if (index === -1 || distance > 0.28) {
        if (this.speakerProfiles.length < 4) {
          estimated = this.speakerProfiles.length;
          this.speakerProfiles.push(signature);
        }
      }

      if (estimated >= 0 && estimated !== this.currentSpeaker) {
        if (this.candidateSpeaker !== estimated) {
          this.candidateSpeaker = estimated;
          this.candidateStartedAt = performance.now();
        }
        if (performance.now() - this.candidateStartedAt > 1_200) {
          this.currentSpeaker = estimated;
          this.callbacks.onSpeakerHint?.(
            `화자 ${estimated + 1}`,
            Math.max(0.5, Math.min(0.85, 1 - distance)),
          );
        }
      } else if (estimated >= 0) {
        this.updateProfile(estimated, signature);
      }
    }

    this.raf = requestAnimationFrame(this.renderAudioState);
  };

  private createSignature(data: Uint8Array) {
    const bands = 8;
    const bandSize = Math.max(1, Math.floor(data.length / bands));
    const result = Array.from({ length: bands }, (_, band) => {
      let total = 0;
      const start = band * bandSize;
      const end = Math.min(data.length, (band + 1) * bandSize);
      for (let i = start; i < end; i += 1) total += data[i];
      return total / Math.max(1, end - start);
    });
    const sum = result.reduce((total, value) => total + value, 0) || 1;
    return result.map((value) => value / sum);
  }

  private closestProfile(signature: number[]) {
    if (this.speakerProfiles.length === 0) return { index: -1, distance: 1 };
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    this.speakerProfiles.forEach((profile, index) => {
      const distance = Math.sqrt(signature.reduce(
        (total, value, position) => total + Math.pow(value - profile[position], 2),
        0,
      ));
      if (distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    });
    return { index: bestIndex, distance: bestDistance };
  }

  private updateProfile(index: number, signature: number[]) {
    const profile = this.speakerProfiles[index];
    if (!profile) return;
    this.speakerProfiles[index] = profile.map((value, position) => (
      value * 0.96 + signature[position] * 0.04
    ));
  }
}
