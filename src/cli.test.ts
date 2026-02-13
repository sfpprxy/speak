import { describe, expect, it } from "bun:test";
import { Buffer } from "node:buffer";
import {
  decodeTtsResponseBody,
  extractBase64Audio,
  parseAuthFileToken,
  normalizeText,
  parseCliArgs,
  toLoudnessRate,
  toPitchSemitone,
  toSpeechRate,
} from "./cli";

describe("text helpers", () => {
  it("normalizes spaces and trims", () => {
    expect(normalizeText("  hello   world  ")).toBe("hello world");
  });

  it("truncates by max length", () => {
    expect(normalizeText("abcdef", 4)).toBe("abcd");
  });
});

describe("audio parameter helpers", () => {
  it("maps speech ratio to expected range", () => {
    expect(toSpeechRate(1)).toBe(0);
    expect(toSpeechRate(1.3)).toBe(30);
    expect(toSpeechRate(10)).toBe(100);
    expect(toSpeechRate(0.1)).toBe(-50);
  });

  it("maps loudness ratio to expected range", () => {
    expect(toLoudnessRate(1)).toBe(0);
    expect(toLoudnessRate(0.75)).toBe(-25);
    expect(toLoudnessRate(10)).toBe(100);
    expect(toLoudnessRate(0)).toBe(-50);
  });

  it("maps pitch ratio to semitone range", () => {
    expect(toPitchSemitone(1)).toBe(0);
    expect(toPitchSemitone(2)).toBe(12);
    expect(toPitchSemitone(0.5)).toBe(-12);
    expect(toPitchSemitone(0.1)).toBe(-12);
  });
});

describe("tts payload decoding", () => {
  const audioBytes = Buffer.from("test-audio-bytes");
  const base64Audio = audioBytes.toString("base64");

  it("extracts base64 audio from json payload", () => {
    expect(extractBase64Audio({ data: base64Audio })).toBe(base64Audio);
  });

  it("decodes single json response", () => {
    const body = JSON.stringify({ code: 0, data: base64Audio });
    const decoded = decodeTtsResponseBody(Buffer.from(body), "application/json");
    expect(Buffer.from(decoded).toString()).toBe("test-audio-bytes");
  });

  it("decodes streaming text chunks", () => {
    const chunk1 = Buffer.from("hello ").toString("base64");
    const chunk2 = Buffer.from("world").toString("base64");
    const body = `{"code":0,"data":"${chunk1}"}\n{"code":0,"data":"${chunk2}"}`;
    const decoded = decodeTtsResponseBody(Buffer.from(body), "text/plain");
    expect(Buffer.from(decoded).toString()).toBe("hello world");
  });

  it("throws for api error json", () => {
    const body = JSON.stringify({ code: 1234, message: "bad auth" });
    expect(() => decodeTtsResponseBody(Buffer.from(body), "application/json")).toThrow("TTS API 1234: bad auth");
  });

  it("throws if json has no audio data", () => {
    const body = JSON.stringify({ code: 0, message: "ok but empty" });
    expect(() => decodeTtsResponseBody(Buffer.from(body), "application/json")).toThrow(
      "TTS JSON response did not include audio data",
    );
  });

  it("returns raw bytes for non-json response", () => {
    const raw = Buffer.from([1, 2, 3, 4]);
    const decoded = decodeTtsResponseBody(raw, "audio/mpeg");
    expect(Array.from(decoded)).toEqual([1, 2, 3, 4]);
  });
});

describe("cli arg parsing", () => {
  it("keeps dash-prefixed text as positional input", () => {
    const parsed = parseCliArgs(["-hello"]);
    expect(parsed).toEqual({ text: "-hello", printConfig: false });
  });

  it("supports explicit text option with dash-prefixed value", () => {
    const parsed = parseCliArgs(["-t", "-hello"]);
    expect(parsed).toEqual({ text: "-hello", printConfig: false });
  });
});

describe("auth file parsing", () => {
  it("extracts token from valid auth.json content", () => {
    const token = parseAuthFileToken('{ "VOLC_TTS_TOKEN": "abc123" }');
    expect(token).toBe("abc123");
  });

  it("returns empty token for invalid content", () => {
    expect(parseAuthFileToken("{bad json")).toBe("");
    expect(parseAuthFileToken('{ "VOLC_TTS_TOKEN": 123 }')).toBe("");
  });
});
