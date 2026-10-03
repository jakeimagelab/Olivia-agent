#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
영상작업실 › 인터뷰 분석 — Mac Studio 음성 인식 헬퍼

node runner(lib/video-interview/node/runVideoInterview.ts)가 클립별로 뽑아 둔 16kHz 모노 WAV를
받아 하나의 타임라인으로 이어 붙이고, 단어 단위 시간이 있는 전사 결과와 문장별 음량(dBFS)을
JSON으로 돌려준다.

- asr_wav  : 작은 목소리(마이크 없는 질문자)도 인식되도록 음량을 고르게 만든 음성
- level_wav: 원본 음량 그대로의 음성 → 문장별 음량으로 질문자/인터뷰이 구분

사용법: interview_transcribe.py --manifest manifest.json --out result.json
진행 상황은 stderr에 "OLIVIA_PY_PROGRESS {json}" 줄로 보낸다.
"""

import argparse
import json
import math
import sys
import wave

import numpy as np

SR = 16000
CHUNK_SEC = 10 * 60          # 10분 단위로 나눠 인식 (진행률 표시 + 메모리 안정)
CHUNK_SEARCH_SEC = 20        # 나누는 지점은 ±20초 안에서 가장 조용한 곳
HALLUCINATIONS = {
    "시청해주셔서 감사합니다", "시청해 주셔서 감사합니다", "구독과 좋아요 부탁드립니다",
    "MBC 뉴스", "KBS 뉴스", "자막 제공", "다음 영상에서 만나요", "끝까지 시청해주셔서 감사합니다",
}


def progress(percent, message):
    sys.stderr.write("OLIVIA_PY_PROGRESS " + json.dumps({"percent": round(percent, 1), "message": message}, ensure_ascii=False) + "\n")
    sys.stderr.flush()


def read_wav(path, expected_samples):
    with wave.open(path, "rb") as handle:
        if handle.getframerate() != SR or handle.getnchannels() != 1 or handle.getsampwidth() != 2:
            raise ValueError(f"16kHz 모노 16bit WAV가 아닙니다: {path}")
        data = np.frombuffer(handle.readframes(handle.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    if len(data) >= expected_samples:
        return data[:expected_samples]
    return np.concatenate([data, np.zeros(expected_samples - len(data), dtype=np.float32)])


def build_timeline(clips, key):
    parts = []
    for clip in clips:
        samples = int(round(float(clip["duration"]) * SR))
        if clip.get(key):
            parts.append(read_wav(clip[key], samples))
        else:
            parts.append(np.zeros(samples, dtype=np.float32))
    return np.concatenate(parts) if parts else np.zeros(SR, dtype=np.float32)


def chunk_points(audio):
    """10분마다, 그 근처에서 가장 조용한 0.5초 지점으로 자른다 (단어가 잘리지 않게)."""
    total = len(audio)
    points = [0]
    window = SR // 2
    target = CHUNK_SEC * SR
    while total - points[-1] > target + CHUNK_SEARCH_SEC * SR:
        center = points[-1] + target
        lo = max(points[-1] + SR * 60, center - CHUNK_SEARCH_SEC * SR)
        hi = min(total - window, center + CHUNK_SEARCH_SEC * SR)
        best, best_energy = center, float("inf")
        for start in range(lo, hi, SR // 10):
            energy = float(np.mean(np.abs(audio[start:start + window])))
            if energy < best_energy:
                best, best_energy = start + window // 2, energy
        points.append(best)
    points.append(total)
    return points


def pick_engine(preferred):
    if preferred in ("auto", "mlx"):
        try:
            import mlx_whisper  # noqa: F401
            return "mlx"
        except ImportError:
            if preferred == "mlx":
                raise
    try:
        import faster_whisper  # noqa: F401
        return "faster"
    except ImportError:
        raise SystemExit("음성인식 엔진이 없습니다. Mac Studio에서 `pip install mlx-whisper` 를 실행하세요.")


def transcribe_chunk(engine, model_name, audio, language, prompt, state):
    if engine == "mlx":
        import mlx_whisper
        result = mlx_whisper.transcribe(
            audio,
            path_or_hf_repo=model_name,
            language=language,
            initial_prompt=prompt,
            word_timestamps=True,
            condition_on_previous_text=False,
            verbose=None,
        )
        out = []
        for segment in result.get("segments", []):
            words = [{"w": w.get("word", "").strip(), "s": float(w["start"]), "e": float(w["end"]), "p": float(w.get("probability", 1.0))}
                     for w in segment.get("words", []) if w.get("word", "").strip()]
            out.append({"start": float(segment["start"]), "end": float(segment["end"]), "text": segment.get("text", ""), "words": words})
        return out
    if "model" not in state:
        from faster_whisper import WhisperModel
        state["model"] = WhisperModel(model_name, device="auto", compute_type="int8")
    segments, _ = state["model"].transcribe(
        audio, language=language, initial_prompt=prompt, word_timestamps=True,
        condition_on_previous_text=False, vad_filter=False,
    )
    out = []
    for segment in segments:
        words = [{"w": w.word.strip(), "s": float(w.start), "e": float(w.end), "p": float(w.probability)}
                 for w in (segment.words or []) if w.word.strip()]
        out.append({"start": float(segment.start), "end": float(segment.end), "text": segment.text, "words": words})
    return out


def level_db(level_audio, spans):
    chunks = [level_audio[max(0, int(s * SR)):max(0, int(e * SR))] for s, e in spans if e > s]
    chunks = [chunk for chunk in chunks if len(chunk)]
    if not chunks:
        return None
    joined = np.concatenate(chunks)
    rms = float(np.sqrt(np.mean(joined.astype(np.float64) ** 2)))
    return round(20 * math.log10(rms + 1e-9), 1)


def clean(segments, level_audio):
    out, previous = [], None
    for segment in segments:
        text = " ".join(segment["text"].split()).strip()
        if not text or text == previous:
            continue
        words = segment["words"]
        avg_p = sum(w["p"] for w in words) / len(words) if words else 1.0
        if text.rstrip(".!? ") in HALLUCINATIONS and avg_p < 0.6:
            continue
        previous = text
        spans = [(w["s"], w["e"]) for w in words] or [(segment["start"], segment["end"])]
        out.append({
            "start": round(segment["start"], 2),
            "end": round(max(segment["end"], segment["start"] + 0.3), 2),
            "text": text,
            "words": [{"w": w["w"], "s": round(w["s"], 2), "e": round(w["e"], 2)} for w in words],
            "levelDb": level_db(level_audio, spans),
        })
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    with open(args.manifest, encoding="utf-8") as handle:
        manifest = json.load(handle)

    clips = manifest["clips"]
    language = manifest.get("language", "ko")
    prompt = manifest.get("prompt") or None
    engine = pick_engine(manifest.get("engine", "auto"))
    model_name = manifest.get("model") or ("mlx-community/whisper-large-v3-turbo" if engine == "mlx" else "large-v3-turbo")

    progress(0, "음성 파일을 이어 붙이는 중")
    asr_audio = build_timeline(clips, "asr_wav")
    level_audio = build_timeline(clips, "level_wav")
    total_sec = len(asr_audio) / SR

    points = chunk_points(asr_audio)
    state, segments = {}, []
    for index in range(len(points) - 1):
        a, b = points[index], points[index + 1]
        progress(100 * a / max(1, len(asr_audio)), f"음성 인식 중 {int(a / SR // 60)}분 / {int(total_sec // 60)}분")
        offset = a / SR
        for segment in transcribe_chunk(engine, model_name, asr_audio[a:b], language, prompt, state):
            segment["start"] += offset
            segment["end"] += offset
            for word in segment["words"]:
                word["s"] += offset
                word["e"] += offset
            segments.append(segment)
    progress(100, "음성 인식 완료")

    result = {"engine": engine, "model": model_name, "durationSec": round(total_sec, 3), "segments": clean(segments, level_audio)}
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False)


if __name__ == "__main__":
    main()
