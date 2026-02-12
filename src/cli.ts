import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const DATA_URI_AUDIO_PREFIX = /^data:audio\/[a-zA-Z0-9.+-]+;base64,/;
const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

const PLIST_PATH = `${process.env.HOME ?? ""}/Library/LaunchAgents/com.joe.speaker.plist`;
const ENV_KEYS = [
  "TTS_PROVIDER",
  "VOICE",
  "VOLC_TTS_APPID",
  "VOLC_TTS_TOKEN",
  "VOLC_TTS_CLUSTER",
  "VOLC_TTS_RESOURCE_ID",
  "VOLC_TTS_VOICE_TYPE",
  "VOLC_TTS_MODEL",
  "VOLC_TTS_ENCODING",
  "VOLC_TTS_RATE",
  "VOLC_TTS_SPEED",
  "VOLC_TTS_VOLUME",
  "VOLC_TTS_PITCH",
  "MAX_TTS_TEXT_LEN",
  "TTS_TIMEOUT_MS",
  "TTS_CACHE_DIR",
] as const;

const DEFAULTS = {
  TTS_PROVIDER: "doubao",
  VOICE: "Samantha",
  VOLC_TTS_CLUSTER: "volcano_tts",
  VOLC_TTS_RESOURCE_ID: "volc.seedtts.default",
  VOLC_TTS_VOICE_TYPE: "zh_female_vv_uranus_bigtts",
  VOLC_TTS_MODEL: "",
  VOLC_TTS_ENCODING: "mp3",
  VOLC_TTS_RATE: "24000",
  VOLC_TTS_SPEED: "1.0",
  VOLC_TTS_VOLUME: "1.0",
  VOLC_TTS_PITCH: "1.0",
  MAX_TTS_TEXT_LEN: "400",
  TTS_TIMEOUT_MS: "10000",
} as const;

type RuntimeConfig = {
  voice: string;
  provider: string;
  appId: string;
  token: string;
  cluster: string;
  resourceId: string;
  voiceType: string;
  model: string;
  encoding: string;
  rate: number;
  speed: number;
  volume: number;
  pitch: number;
  maxTextLen: number;
  timeoutMs: number;
  cacheDir: string;
};

function defaultCacheDir(): string {
  return join(process.env.TMPDIR ?? "/tmp", "speaker-tts-cache");
}

function envString(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function envNumber(name: string, fallback: string): number {
  return Number(process.env[name] ?? fallback);
}

function readRuntimeConfig(): RuntimeConfig {
  return {
    voice: envString("VOICE", DEFAULTS.VOICE),
    provider: envString("TTS_PROVIDER", DEFAULTS.TTS_PROVIDER).toLowerCase(),
    appId: envString("VOLC_TTS_APPID", ""),
    token: envString("VOLC_TTS_TOKEN", ""),
    cluster: envString("VOLC_TTS_CLUSTER", DEFAULTS.VOLC_TTS_CLUSTER),
    resourceId: envString("VOLC_TTS_RESOURCE_ID", DEFAULTS.VOLC_TTS_RESOURCE_ID),
    voiceType: envString("VOLC_TTS_VOICE_TYPE", DEFAULTS.VOLC_TTS_VOICE_TYPE),
    model: envString("VOLC_TTS_MODEL", DEFAULTS.VOLC_TTS_MODEL),
    encoding: envString("VOLC_TTS_ENCODING", DEFAULTS.VOLC_TTS_ENCODING),
    rate: envNumber("VOLC_TTS_RATE", DEFAULTS.VOLC_TTS_RATE),
    speed: envNumber("VOLC_TTS_SPEED", DEFAULTS.VOLC_TTS_SPEED),
    volume: envNumber("VOLC_TTS_VOLUME", DEFAULTS.VOLC_TTS_VOLUME),
    pitch: envNumber("VOLC_TTS_PITCH", DEFAULTS.VOLC_TTS_PITCH),
    maxTextLen: envNumber("MAX_TTS_TEXT_LEN", DEFAULTS.MAX_TTS_TEXT_LEN),
    timeoutMs: envNumber("TTS_TIMEOUT_MS", DEFAULTS.TTS_TIMEOUT_MS),
    cacheDir: process.env.TTS_CACHE_DIR ?? defaultCacheDir(),
  };
}

let runtime = readRuntimeConfig();

let queue: Promise<void> = Promise.resolve();
let cachePrepared = false;

function stripAudioDataUriPrefix(value: string): string {
  return value.replace(DATA_URI_AUDIO_PREFIX, "").trim();
}

function isLikelyBase64(value: string): boolean {
  if (value.length < 8) return false;
  if (value.length % 4 !== 0) return false;
  return BASE64_REGEX.test(value);
}

export function normalizeText(input: string, maxLen = 400): string {
  const trimmed = input.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function extractBase64Audio(payload: unknown): string {
  const data = payload as Record<string, unknown> | null;
  const result = data && typeof data.result === "object" ? (data.result as Record<string, unknown>) : null;
  const innerData = data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : null;

  const candidates = [data?.data, data?.audio, result?.audio, innerData?.audio, result?.data];

  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const cleaned = stripAudioDataUriPrefix(value);
    if (isLikelyBase64(cleaned)) {
      return cleaned;
    }
  }

  throw new Error("No base64 audio found in response");
}

export function extractAudioChunksFromStreamingJson(text: string): Uint8Array[] {
  const audioChunks: Uint8Array[] = [];
  const dataFieldRegex = /"data":"([^"]+)"/g;
  let match: RegExpExecArray | null = null;
  while ((match = dataFieldRegex.exec(text)) !== null) {
    const maybeBase64 = stripAudioDataUriPrefix(match[1]);
    if (!isLikelyBase64(maybeBase64)) continue;
    audioChunks.push(Buffer.from(maybeBase64, "base64"));
  }
  return audioChunks;
}

export function toSpeechRate(speedRatio: number): number {
  if (!Number.isFinite(speedRatio)) return 0;
  const value = Math.round((speedRatio - 1) * 100);
  return Math.max(-50, Math.min(100, value));
}

export function toLoudnessRate(volumeRatio: number): number {
  if (!Number.isFinite(volumeRatio)) return 0;
  const value = Math.round((volumeRatio - 1) * 100);
  return Math.max(-50, Math.min(100, value));
}

export function toPitchSemitone(pitchRatio: number): number {
  if (!Number.isFinite(pitchRatio)) return 0;
  const semitone = Math.round(12 * Math.log2(Math.max(0.25, pitchRatio)));
  return Math.max(-12, Math.min(12, semitone));
}

export function decodeTtsResponseBody(responseBytes: Uint8Array, contentType: string): Uint8Array {
  if (responseBytes.byteLength === 0) {
    throw new Error("TTS returned empty audio buffer");
  }

  const normalizedContentType = contentType.toLowerCase();
  const likelyJson =
    normalizedContentType.includes("application/json") ||
    normalizedContentType.includes("text/plain") ||
    responseBytes[0] === 0x7b;

  if (!likelyJson) {
    return responseBytes;
  }

  const text = new TextDecoder().decode(responseBytes);
  try {
    const parsed = JSON.parse(text);
    const apiCode = (parsed as any)?.header?.code ?? (parsed as any)?.code;
    if (typeof apiCode === "number" && apiCode !== 0 && apiCode !== 20000000) {
      const message = (parsed as any)?.header?.message ?? (parsed as any)?.message ?? "unknown error";
      throw new Error(`TTS API ${apiCode}: ${message}`);
    }

    const base64 = extractBase64Audio(parsed);
    return Buffer.from(base64, "base64");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TTS API ")) {
      throw error;
    }

    const chunks = extractAudioChunksFromStreamingJson(text);
    if (chunks.length > 0) {
      return concatBytes(chunks);
    }

    throw new Error("TTS JSON response did not include audio data");
  }
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

function isDebugEnabled(): boolean {
  return ["1", "true", "yes", "on"].includes((process.env.SPEAKER_DEBUG ?? "").toLowerCase());
}

function debugLog(message: string): void {
  if (isDebugEnabled()) {
    console.error(`[speaker:debug] ${message}`);
  }
}

function parseCliArgs(argv: string[]): { text: string; printConfig: boolean } {
  let debug = false;
  let printConfig = false;
  const cleanArgs: string[] = [];
  for (const arg of argv) {
    if (arg === "--debug" || arg === "-d") {
      debug = true;
      continue;
    }
    if (arg === "--print-config" || arg === "--config") {
      printConfig = true;
      continue;
    }
    cleanArgs.push(arg);
  }

  if (debug && !process.env.SPEAKER_DEBUG) {
    process.env.SPEAKER_DEBUG = "1";
  }

  return { text: parseTextFromArgs(cleanArgs), printConfig };
}

function parseTextFromArgs(argv: string[]): string {
  const index = argv.findIndex((arg) => arg === "--text" || arg === "-t");
  if (index >= 0) {
    return argv[index + 1] ?? "";
  }
  return argv.join(" ");
}

function readPlistEnvValue(key: string): string {
  const out = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Print :EnvironmentVariables:${key}`, PLIST_PATH], {
    encoding: "utf8",
  });
  if (out.status !== 0) return "";
  return out.stdout.trim();
}

function hydrateEnvFromPlist(): void {
  for (const key of ENV_KEYS) {
    if (process.env[key]) continue;
    const value = readPlistEnvValue(key);
    if (value) {
      process.env[key] = value;
    }
  }
}

function refreshRuntimeConfig(): void {
  runtime = readRuntimeConfig();
}

function printSafeConfig(): void {
  const tmpdir = process.env.TMPDIR ?? "/tmp/";
  const cacheDir = process.env.TTS_CACHE_DIR ?? `${tmpdir.replace(/\/?$/, "/")}speaker-tts-cache`;
  const fields = [
    ["SPEAKER_DEBUG", process.env.SPEAKER_DEBUG ?? ""],
    ["TTS_PROVIDER", process.env.TTS_PROVIDER ?? DEFAULTS.TTS_PROVIDER],
    ["VOICE", process.env.VOICE ?? DEFAULTS.VOICE],
    ["VOLC_TTS_APPID", maskSecret(process.env.VOLC_TTS_APPID ?? "")],
    ["VOLC_TTS_TOKEN", maskSecret(process.env.VOLC_TTS_TOKEN ?? "")],
    ["VOLC_TTS_CLUSTER", process.env.VOLC_TTS_CLUSTER ?? DEFAULTS.VOLC_TTS_CLUSTER],
    ["VOLC_TTS_RESOURCE_ID", process.env.VOLC_TTS_RESOURCE_ID ?? DEFAULTS.VOLC_TTS_RESOURCE_ID],
    ["VOLC_TTS_VOICE_TYPE", process.env.VOLC_TTS_VOICE_TYPE ?? DEFAULTS.VOLC_TTS_VOICE_TYPE],
    ["VOLC_TTS_MODEL", process.env.VOLC_TTS_MODEL ?? DEFAULTS.VOLC_TTS_MODEL],
    ["VOLC_TTS_ENCODING", process.env.VOLC_TTS_ENCODING ?? DEFAULTS.VOLC_TTS_ENCODING],
    ["VOLC_TTS_RATE", process.env.VOLC_TTS_RATE ?? DEFAULTS.VOLC_TTS_RATE],
    ["VOLC_TTS_SPEED", process.env.VOLC_TTS_SPEED ?? DEFAULTS.VOLC_TTS_SPEED],
    ["VOLC_TTS_VOLUME", process.env.VOLC_TTS_VOLUME ?? DEFAULTS.VOLC_TTS_VOLUME],
    ["VOLC_TTS_PITCH", process.env.VOLC_TTS_PITCH ?? DEFAULTS.VOLC_TTS_PITCH],
    ["MAX_TTS_TEXT_LEN", process.env.MAX_TTS_TEXT_LEN ?? DEFAULTS.MAX_TTS_TEXT_LEN],
    ["TTS_TIMEOUT_MS", process.env.TTS_TIMEOUT_MS ?? DEFAULTS.TTS_TIMEOUT_MS],
    ["TTS_CACHE_DIR", cacheDir],
  ] as const;

  for (const [key, value] of fields) {
    console.log(`${key}=${value}`);
  }
}

function withTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref?.();
  return controller.signal;
}

async function ensureCacheDir(): Promise<void> {
  if (cachePrepared) return;
  await fs.mkdir(runtime.cacheDir, { recursive: true });
  cachePrepared = true;
}

async function cleanupOldCacheFiles(days = 7): Promise<void> {
  try {
    await ensureCacheDir();
    const files = await fs.readdir(runtime.cacheDir);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    await Promise.all(
      files.map(async (name) => {
        const path = join(runtime.cacheDir, name);
        const stat = await fs.stat(path).catch(() => null);
        if (stat && stat.mtimeMs < cutoff) {
          await fs.unlink(path).catch(() => {});
        }
      }),
    );
  } catch {
    // ignore cache cleanup errors
  }
}

async function fallbackSpeakWithSay(text: string): Promise<void> {
  debugLog(`fallback say start voice=${runtime.voice} text_len=${text.length}`);
  const proc = Bun.spawn(["say", "-v", runtime.voice, text], {
    stdout: "ignore",
    stderr: "ignore",
  });
  const exitCode = await proc.exited;
  debugLog(`fallback say exit_code=${exitCode}`);
  if (exitCode !== 0) {
    throw new Error(`say exited with code ${exitCode}`);
  }
}

async function playMp3File(path: string): Promise<void> {
  debugLog(`afplay start file=${path}`);
  const proc = Bun.spawn(["afplay", path], {
    stdout: "ignore",
    stderr: "ignore",
  });
  const exitCode = await proc.exited;
  debugLog(`afplay exit_code=${exitCode}`);
  if (exitCode !== 0) {
    throw new Error(`afplay exited with code ${exitCode}`);
  }
}

async function synthesizeDoubaoMp3(text: string): Promise<Uint8Array> {
  if (!runtime.appId || !runtime.token || !runtime.resourceId || !runtime.voiceType) {
    throw new Error("Missing VOLC_TTS credentials/config");
  }

  const pitch = toPitchSemitone(runtime.pitch);
  const reqParams: Record<string, unknown> = {
    text,
    speaker: runtime.voiceType,
    audio_params: {
      format: runtime.encoding,
      sample_rate: runtime.rate,
      speech_rate: toSpeechRate(runtime.speed),
      loudness_rate: toLoudnessRate(runtime.volume),
    },
  };

  if (runtime.model) {
    reqParams.model = runtime.model;
  }
  if (pitch !== 0) {
    reqParams.additions = { post_process: { pitch } };
  }

  const payload = {
    user: { uid: "speaker" },
    request: "BidirectionalTTS",
    req_params: reqParams,
  };

  const response = await fetch("https://openspeech.bytedance.com/api/v3/tts/unidirectional", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-App-Id": runtime.appId,
      "X-Api-Access-Key": runtime.token,
      "X-Api-Resource-Id": runtime.resourceId,
      "X-Api-Request-Id": randomUUID(),
    },
    body: JSON.stringify(payload),
    signal: withTimeoutSignal(runtime.timeoutMs),
  });

  if (!response.ok) {
    debugLog(`doubao http_status=${response.status}`);
    throw new Error(`TTS HTTP ${response.status}`);
  }

  const responseBytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "";
  debugLog(`doubao response_bytes=${responseBytes.length} content_type=${contentType || "unknown"}`);
  return decodeTtsResponseBody(responseBytes, contentType);
}

function cacheKeyFor(text: string): string {
  const key = [
    text,
    runtime.cluster,
    runtime.resourceId,
    runtime.voiceType,
    runtime.model,
    runtime.encoding,
    String(runtime.rate),
    String(runtime.speed),
    String(runtime.volume),
    String(runtime.pitch),
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}

async function synthesizeAndPlayWithDoubao(text: string): Promise<void> {
  await ensureCacheDir();
  const filePath = join(runtime.cacheDir, `${cacheKeyFor(text)}.mp3`);

  const exists = await fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    debugLog(`cache miss file=${filePath}`);
    const audioBytes = await synthesizeDoubaoMp3(text);
    await Bun.write(filePath, audioBytes);
    debugLog(`cache write bytes=${audioBytes.length}`);
  } else {
    debugLog(`cache hit file=${filePath}`);
  }

  await playMp3File(filePath);
}

async function speakInternal(rawText: string): Promise<void> {
  refreshRuntimeConfig();
  const text = normalizeText(rawText, runtime.maxTextLen);
  if (!text) {
    throw new Error("text is required");
  }
  debugLog(`speak start provider=${runtime.provider} text_len=${text.length}`);

  if (runtime.provider === "say") {
    await fallbackSpeakWithSay(text);
    return;
  }

  try {
    await synthesizeAndPlayWithDoubao(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    debugLog(`doubao failed reason=${reason}`);
    await fallbackSpeakWithSay(text);
  }
}

export function speak(rawText: string): Promise<void> {
  const task = queue.then(() => speakInternal(rawText));
  queue = task.catch(() => {});
  return task;
}

export async function speakOnce(rawText: string): Promise<void> {
  await speakInternal(rawText);
}

async function main() {
  const { text, printConfig } = parseCliArgs(process.argv.slice(2));
  hydrateEnvFromPlist();
  refreshRuntimeConfig();
  debugLog(`cli cwd=${process.cwd()}`);
  debugLog(`cli plist=${PLIST_PATH}`);
  debugLog(`cli provider=${process.env.TTS_PROVIDER ?? "doubao"}`);
  debugLog(`cli voice=${process.env.VOICE ?? "Samantha"}`);
  debugLog(`cli volc.appid=${maskSecret(process.env.VOLC_TTS_APPID ?? "")}`);
  debugLog(`cli volc.token=${maskSecret(process.env.VOLC_TTS_TOKEN ?? "")}`);
  debugLog(`cli volc.resource_id=${process.env.VOLC_TTS_RESOURCE_ID ?? ""}`);
  debugLog(`cli volc.voice_type=${process.env.VOLC_TTS_VOICE_TYPE ?? ""}`);
  debugLog(`cli text.length=${text.length}`);

  if (printConfig) {
    printSafeConfig();
    return;
  }

  if (!text.trim()) {
    console.error("usage: bun run src/cli.ts [--debug|-d] [--print-config|--config] --text \"hello\"");
    console.error("   or: bun run src/cli.ts [--debug|-d] [--print-config|--config] \"hello\"");
    process.exit(1);
  }

  cleanupOldCacheFiles().catch(() => {});
  await speak(text);
  console.log("spoken");
}

if (import.meta.main) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`speak failed: ${message}`);
    process.exit(1);
  });
}
