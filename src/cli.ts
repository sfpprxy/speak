import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const DATA_URI_AUDIO_PREFIX = /^data:audio\/[a-zA-Z0-9.+-]+;base64,/;
const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

const PLIST_PATH = `${process.env.HOME ?? ""}/Library/LaunchAgents/com.joe.speaker.plist`;
const ENV_KEYS = [
  "TTS_PROVIDER",
  "VOLC_TTS_APPID",
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
const AUTH_DIR = join(process.env.HOME ?? ".", ".speak");
const AUTH_FILE = join(AUTH_DIR, "auth.json");

const DEFAULTS = {
  TTS_PROVIDER: "doubao",
  VOLC_TTS_APPID: "3864509867",
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

let persistedAuthToken = "";
let authTokenHydrated = false;
let runtime = readRuntimeConfig();
let queue: Promise<void> = Promise.resolve();
let cachePrepared = false;

async function main() {
  const { text, printConfig, printHelp } = parseCliArgs(process.argv.slice(2));
  if (printHelp) {
    printHelpText();
    return;
  }
  hydrateEnvFromPlist();
  refreshRuntimeConfig();
  await hydrateAuthTokenFromDisk();
  for (const message of [
    `cli cwd=${process.cwd()}`,
    `cli plist=${PLIST_PATH}`,
    `cli provider=${runtime.provider}`,
    `cli volc.appid=${maskSecret(runtime.appId)}`,
    `cli volc.token=${maskSecret(runtime.token)}`,
    `cli volc.resource_id=${runtime.resourceId}`,
    `cli volc.voice_type=${runtime.voiceType}`,
    `cli text.length=${text.length}`,
  ]) {
    debugLog(message);
  }

  if (printConfig) {
    printSafeConfig();
    return;
  }

  if (!text.trim()) {
    printHelpText();
    process.exit(1);
  }

  cleanupOldCacheFiles().catch(() => {});
  await speak(text);
}

if (import.meta.main) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`speak failed: ${message}`);
    process.exit(1);
  });
}

export function speak(rawText: string): Promise<void> {
  const task = queue.then(() => speakInternal(rawText));
  queue = task.catch(() => {});
  return task;
}

export async function speakOnce(rawText: string): Promise<void> {
  await speakInternal(rawText);
}

async function speakInternal(rawText: string): Promise<void> {
  refreshRuntimeConfig();
  await hydrateAuthTokenFromDisk();
  const text = normalizeText(rawText, runtime.maxTextLen);
  if (!text) {
    throw new Error("text is required");
  }
  debugLog(`speak start provider=${runtime.provider} text_len=${text.length}`);

  if (runtime.provider !== "doubao") {
    throw new Error(`unsupported TTS_PROVIDER: ${runtime.provider}`);
  }
  await ensureAuthToken();

  await synthesizeAndPlayWithDoubao(text);
}

async function synthesizeAndPlayWithDoubao(text: string): Promise<void> {
  await ensureCacheDir();
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
  const filePath = join(runtime.cacheDir, `${createHash("sha256").update(key).digest("hex")}.mp3`);

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
    signal: AbortSignal.timeout(runtime.timeoutMs),
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

async function playMp3File(path: string): Promise<void> {
  const candidates = getAudioCommandCandidates(path);
  const errors: string[] = [];

  for (const args of candidates) {
    const tool = args[0];
    try {
      await runAudioCommand(args, `${tool} start file=${path}`, `${tool} exit_code=`, tool);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${tool}: ${message}`);
      debugLog(`${tool} failed: ${message}`);
    }
  }

  throw new Error(`No audio player available on ${process.platform}. ${getAudioInstallHint()} Tried: ${errors.join(" | ")}`);
}

async function runAudioCommand(args: string[], startLog: string, endLogPrefix: string, errorName: string): Promise<void> {
  debugLog(startLog);
  let exitCode = -1;
  try {
    exitCode = await Bun.spawn(args, { stdout: "ignore", stderr: "ignore" }).exited;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${errorName} failed to start: ${message}`);
  }
  debugLog(`${endLogPrefix}${exitCode}`);
  if (exitCode !== 0) {
    throw new Error(`${errorName} exited with code ${exitCode}`);
  }
}

function getAudioCommandCandidates(path: string): string[][] {
  if (process.platform === "darwin") {
    return [
      ["afplay", path],
      ["ffplay", "-nodisp", "-autoexit", "-loglevel", "error", path],
      ["mpv", "--no-video", "--really-quiet", path],
    ];
  }

  if (process.platform === "linux") {
    return [
      ["ffplay", "-nodisp", "-autoexit", "-loglevel", "error", path],
      ["mpv", "--no-video", "--really-quiet", path],
      ["paplay", path],
      ["aplay", path],
      ["play", "-q", path],
    ];
  }

  if (process.platform === "win32") {
    return [
      [
        "powershell",
        "-NoProfile",
        "-Command",
        getWindowsMediaPlayerScript(path),
      ],
      ["ffplay", "-nodisp", "-autoexit", "-loglevel", "error", path],
    ];
  }

  return [
    ["ffplay", "-nodisp", "-autoexit", "-loglevel", "error", path],
    ["mpv", "--no-video", "--really-quiet", path],
  ];
}

function getWindowsMediaPlayerScript(path: string): string {
  const escapedPath = path.replace(/\\/g, "/").replace(/'/g, "''");
  return `$ErrorActionPreference='Stop'; $p=New-Object -ComObject WMPlayer.OCX; $p.URL='${escapedPath}'; $p.controls.play(); while ($p.playState -ne 1) { Start-Sleep -Milliseconds 100 }; $p.close();`;
}

function getAudioInstallHint(): string {
  if (process.platform === "darwin") {
    return "Install ffmpeg (ffplay) or mpv if afplay is unavailable.";
  }
  if (process.platform === "linux") {
    return "Install ffmpeg (ffplay) or mpv for audio playback.";
  }
  if (process.platform === "win32") {
    return "Enable Windows Media Player or install ffmpeg (ffplay).";
  }
  return "Install ffmpeg (ffplay) or mpv for audio playback.";
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

async function ensureCacheDir(): Promise<void> {
  if (cachePrepared) return;
  await fs.mkdir(runtime.cacheDir, { recursive: true });
  cachePrepared = true;
}

export function parseAuthFileToken(jsonText: string): string {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return typeof parsed.VOLC_TTS_TOKEN === "string" ? parsed.VOLC_TTS_TOKEN.trim() : "";
  } catch {
    return "";
  }
}

async function hydrateAuthTokenFromDisk(): Promise<void> {
  if (!authTokenHydrated) {
    authTokenHydrated = true;
    persistedAuthToken = await fs
      .readFile(AUTH_FILE, "utf8")
      .then((content) => parseAuthFileToken(content))
      .catch(() => "");
  }
  if (persistedAuthToken && !runtime.token) {
    runtime.token = persistedAuthToken;
  }
}

async function ensureAuthToken(): Promise<void> {
  if (runtime.token) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`VOLC_TTS_TOKEN is missing. Run once in a terminal to save token at ${AUTH_FILE}`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const token = (await rl.question("First run: enter VOLC_TTS_TOKEN: ")).trim();
    if (!token) {
      throw new Error("VOLC_TTS_TOKEN is required");
    }
    await fs.mkdir(AUTH_DIR, { recursive: true, mode: 0o700 });
    await fs.writeFile(AUTH_FILE, `${JSON.stringify({ VOLC_TTS_TOKEN: token }, null, 2)}\n`, { mode: 0o600 });
    await fs.chmod(AUTH_DIR, 0o700).catch(() => {});
    await fs.chmod(AUTH_FILE, 0o600).catch(() => {});
    persistedAuthToken = token;
    authTokenHydrated = true;
    runtime.token = token;
    console.error(`saved VOLC_TTS_TOKEN to ${AUTH_FILE}`);
  } finally {
    rl.close();
  }
}

export function parseCliArgs(argv: string[]): { text: string; printConfig: boolean; printHelp: boolean } {
  let debug = false;
  let printConfig = false;
  let printHelp = false;
  const cleanArgs: string[] = [];
  for (const arg of argv) {
    if (arg === "--debug" || arg === "-d") debug = true;
    else if (arg === "--print-config" || arg === "--config") printConfig = true;
    else if (arg === "--help" || arg === "-h") printHelp = true;
    else cleanArgs.push(arg);
  }

  if (debug && !process.env.SPEAKER_DEBUG) process.env.SPEAKER_DEBUG = "1";

  const textIndex = cleanArgs.findIndex((arg) => arg === "--text" || arg === "-t");
  return {
    text: textIndex >= 0 ? (cleanArgs[textIndex + 1] ?? "") : cleanArgs.join(" "),
    printConfig,
    printHelp,
  };
}

function printHelpText(): void {
  const optionRows: Array<[string, string]> = [
    ["-h, --help", "Show this help"],
    ["-d, --debug", "Enable debug logs"],
    ["--print-config, --config", "Print effective config and exit"],
    ["-t, --text <text>", "Text to speak"],
  ];
  const optionWidth = optionRows.reduce((max, [flags]) => Math.max(max, flags.length), 0) + 2;

  console.error("Usage: speak [options] --text \"hello\"");
  console.error("   or: speak [options] \"hello\"");
  console.error("");
  console.error("Options:");
  for (const [flags, description] of optionRows) {
    console.error(`  ${flags.padEnd(optionWidth)}${description}`);
  }
}

function printSafeConfig(): void {
  const tmpdir = process.env.TMPDIR ?? "/tmp/";
  const cacheDir = process.env.TTS_CACHE_DIR ?? `${tmpdir.replace(/\/?$/, "/")}speaker-tts-cache`;
  const fields = [
    ["SPEAKER_DEBUG", process.env.SPEAKER_DEBUG ?? ""],
    ["TTS_PROVIDER", process.env.TTS_PROVIDER ?? DEFAULTS.TTS_PROVIDER],
    ["VOLC_TTS_APPID", maskSecret(process.env.VOLC_TTS_APPID ?? DEFAULTS.VOLC_TTS_APPID)],
    ["VOLC_TTS_TOKEN", maskSecret(runtime.token)],
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

function refreshRuntimeConfig(): void {
  runtime = readRuntimeConfig();
}

function readRuntimeConfig(): RuntimeConfig {
  return {
    provider: envString("TTS_PROVIDER", DEFAULTS.TTS_PROVIDER).toLowerCase(),
    appId: envString("VOLC_TTS_APPID", DEFAULTS.VOLC_TTS_APPID),
    token: persistedAuthToken,
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
    cacheDir: process.env.TTS_CACHE_DIR ?? join(process.env.TMPDIR ?? "/tmp", "speaker-tts-cache"),
  };
}

function hydrateEnvFromPlist(): void {
  if (process.platform !== "darwin") return;
  for (const key of ENV_KEYS) {
    if (process.env[key]) continue;
    const out = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Print :EnvironmentVariables:${key}`, PLIST_PATH], {
      encoding: "utf8",
    });
    const value = out.status === 0 ? out.stdout.trim() : "";
    if (value) {
      process.env[key] = value;
    }
  }
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

export function toPitchSemitone(pitchRatio: number): number {
  if (!Number.isFinite(pitchRatio)) return 0;
  const semitone = Math.round(12 * Math.log2(Math.max(0.25, pitchRatio)));
  return Math.max(-12, Math.min(12, semitone));
}

export function toSpeechRate(speedRatio: number): number {
  return ratioToPercentRate(speedRatio, -50, 100);
}

export function toLoudnessRate(volumeRatio: number): number {
  return ratioToPercentRate(volumeRatio, -50, 100);
}

function ratioToPercentRate(ratio: number, min: number, max: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(min, Math.min(max, Math.round((ratio - 1) * 100)));
}

export function normalizeText(input: string, maxLen = 400): string {
  const trimmed = input.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

function debugLog(message: string): void {
  if (["1", "true", "yes", "on"].includes((process.env.SPEAKER_DEBUG ?? "").toLowerCase())) {
    console.error(`[speaker:debug] ${message}`);
  }
}

function envString(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function envNumber(name: string, fallback: string): number {
  return Number(process.env[name] ?? fallback);
}

function stripAudioDataUriPrefix(value: string): string {
  return value.replace(DATA_URI_AUDIO_PREFIX, "").trim();
}

function isLikelyBase64(value: string): boolean {
  if (value.length < 8) return false;
  if (value.length % 4 !== 0) return false;
  return BASE64_REGEX.test(value);
}
