import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { analyzeWav, UNSUPPORTED_WAV_NOTE, VIDEO_CONTI_BGM_MAX_BYTES } from "@/lib/video-conti/bgm";
import { POST as createTicket } from "@/app/api/video-conti/bgm-upload/ticket/route";

function wav(bits: 8 | 16 | 24 | 32, format: 1 | 3 = 1): Buffer {
  const sampleRate = 100;
  const samples = Array.from({ length: 800 }, (_, index) => Math.sin(index / 7) * (index < 300 ? 0.15 : index < 550 ? 0.5 : 0.85));
  const bytes = bits / 8;
  const buffer = Buffer.alloc(44 + samples.length * bytes);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(format, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * bytes, 28); buffer.writeUInt16LE(bytes, 32); buffer.writeUInt16LE(bits, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(samples.length * bytes, 40);
  samples.forEach((value, index) => {
    const offset = 44 + index * bytes;
    if (format === 3) buffer.writeFloatLE(value, offset);
    else if (bits === 8) buffer.writeUInt8(Math.round((value + 1) * 127.5), offset);
    else if (bits === 16) buffer.writeInt16LE(Math.round(value * 32767), offset);
    else if (bits === 24) buffer.writeIntLE(Math.round(value * 8388607), offset, 3);
    else buffer.writeInt32LE(Math.round(value * 2147483647), offset);
  });
  return buffer;
}

function ticketRequest(fileName: string, size: number) {
  return new NextRequest("http://localhost/api/video-conti/bgm-upload/ticket", { method: "POST", headers: { "Content-Type": "application/json", Cookie: "pc_admin_session=active" }, body: JSON.stringify({ videoContiId: "conti_1", fileName, contentType: "audio/wav", size }) });
}

describe("video conti BGM", () => {
  it("produces equal section counts and energy grades for 16/24bit PCM and 32bit float", () => {
    const results = [analyzeWav(wav(16)), analyzeWav(wav(24)), analyzeWav(wav(32, 3))];
    expect(results.map((result) => result.sections.length)).toEqual([results[0].sections.length, results[0].sections.length, results[0].sections.length]);
    expect(results.map((result) => result.sections.map((section) => section.energyLevel))).toEqual([results[0].sections.map((section) => section.energyLevel), results[0].sections.map((section) => section.energyLevel), results[0].sections.map((section) => section.energyLevel)]);
    expect(results.every((result) => result.estimatedBpm === null)).toBe(true);
  });

  it("returns an explicit note for unsupported 8bit WAV", () => {
    expect(analyzeWav(wav(8)).note).toBe(UNSUPPORTED_WAV_NOTE);
  });

  it("rejects over-50MB and unsupported extensions before creating an upload ticket", async () => {
    expect((await createTicket(ticketRequest("music.wav", VIDEO_CONTI_BGM_MAX_BYTES + 1))).status).toBe(400);
    expect((await createTicket(ticketRequest("music.aac", 1024))).status).toBe(400);
  });
});
