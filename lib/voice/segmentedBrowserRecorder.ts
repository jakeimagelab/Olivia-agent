import { analyzeWaveformFrame, preferredMimeType, type RecorderCallbacks, type RecorderQuality } from "@/lib/voice/browserRecorder";

type Segment = { blob: Blob; mimeType: string };

/**
 * Interview-only recorder. It deliberately owns only one short current segment;
 * general OliviaBrowserRecorder remains the existing single-recording path.
 */
export class OliviaSegmentedBrowserRecorder {
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private raf?: number;
  private paused = false;
  private chunks: Blob[] = [];
  private waveformCeiling = 0.025;
  private waveform = Array(48).fill(0.05);
  public mimeType = "";
  public quality: RecorderQuality = {
    requestedSampleRate: 48_000,
    requestedChannelCount: 1,
    requestedBitsPerSecond: 128_000,
    actualSampleRate: null,
    actualChannelCount: null,
    actualBitsPerSecond: null,
    mimeType: "",
  };

  constructor(private callbacks: Pick<RecorderCallbacks, "onWaveform" | "onStateWarning" | "onInterrupted"> = {}) {}

  get state(): RecordingState | "idle" {
    return this.recorder?.state ?? "idle";
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("이 브라우저에서는 음성 녹음을 지원하지 않습니다.");
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: { ideal: 1 }, sampleRate: { ideal: 48_000 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "OverconstrainedError") this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      else throw error;
    }
    try {
      this.mimeType = preferredMimeType();
      this.context = new AudioContext();
      if (this.context.state === "suspended") await this.context.resume();
      const source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = .72;
      source.connect(this.analyser);
      this.stream.getAudioTracks().forEach((track) => {
        track.addEventListener("ended", () => this.callbacks.onInterrupted?.("마이크 입력이 중단되었습니다. 저장된 구간을 확인해주세요."), { once: true });
      });
      this.startSegment();
      this.renderAudioState();
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  pause() {
    if (this.recorder?.state !== "recording") return;
    this.recorder.pause();
    this.paused = true;
    this.waveform = Array(48).fill(.05);
    this.callbacks.onWaveform?.(this.waveform);
  }

  resume() {
    if (this.recorder?.state !== "paused") return;
    this.recorder.resume();
    this.paused = false;
    if (this.context?.state === "suspended") void this.context.resume();
  }

  /** Closes the current segment and starts the next one on the same MediaStream. */
  async rotate(): Promise<Segment | null> {
    if (!this.recorder || this.recorder.state === "inactive" || this.recorder.state === "paused") return null;
    const segment = await this.stopCurrentSegment(true);
    return segment;
  }

  async stop(): Promise<Segment> {
    if (!this.recorder || this.recorder.state === "inactive") throw new Error("Recorder가 시작되지 않았습니다.");
    const segment = await this.stopCurrentSegment(false);
    this.cleanup();
    return segment;
  }

  requestData() {
    if (this.recorder?.state === "recording") this.recorder.requestData();
  }

  private startSegment() {
    if (!this.stream) throw new Error("마이크 스트림이 없습니다.");
    this.chunks = [];
    const recorder = new MediaRecorder(this.stream, { ...(this.mimeType ? { mimeType: this.mimeType } : {}), audioBitsPerSecond: 128_000 });
    const settings = this.stream.getAudioTracks()[0]?.getSettings();
    this.quality = {
      requestedSampleRate: 48_000,
      requestedChannelCount: 1,
      requestedBitsPerSecond: 128_000,
      actualSampleRate: typeof settings?.sampleRate === "number" ? settings.sampleRate : null,
      actualChannelCount: typeof settings?.channelCount === "number" ? settings.channelCount : null,
      actualBitsPerSecond: typeof recorder.audioBitsPerSecond === "number" ? recorder.audioBitsPerSecond : null,
      mimeType: recorder.mimeType || this.mimeType,
    };
    recorder.ondataavailable = (event) => { if (event.data.size > 0) this.chunks.push(event.data); };
    recorder.onerror = () => this.callbacks.onStateWarning?.("브라우저 녹음기에 문제가 발생했습니다. 녹음을 종료해 저장해주세요.");
    recorder.start();
    this.recorder = recorder;
  }

  private async stopCurrentSegment(startNext: boolean): Promise<Segment> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") throw new Error("녹음 조각이 시작되지 않았습니다.");
    const wasPaused = recorder.state === "paused";
    return new Promise<Segment>((resolve, reject) => {
      const chunks = this.chunks;
      recorder.onstop = () => {
        const segment = { blob: new Blob(chunks, { type: recorder.mimeType || this.mimeType || "audio/webm" }), mimeType: recorder.mimeType || this.mimeType || "audio/webm" };
        try {
          if (startNext) {
            this.paused = false;
            this.startSegment();
          }
          resolve(segment);
        } catch (error) { reject(error); }
      };
      if (wasPaused) recorder.resume();
      recorder.stop();
    });
  }

  private renderAudioState = () => {
    if (!this.analyser) return;
    if (!this.paused) {
      const timeData = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteTimeDomainData(timeData);
      const frame = analyzeWaveformFrame(timeData, this.waveform, this.waveformCeiling);
      this.waveform = frame.values;
      this.waveformCeiling = frame.ceiling;
      this.callbacks.onWaveform?.(frame.values);
    }
    this.raf = requestAnimationFrame(this.renderAudioState);
  };

  private cleanup() {
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    this.raf = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    void this.context?.close();
    this.context = undefined;
    this.analyser = undefined;
    this.recorder = undefined;
    this.paused = false;
  }
}
