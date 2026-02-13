#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

function detectLinuxLibc() {
  if (process.platform !== "linux") return "gnu";

  const reportApi = process.report;
  if (reportApi && typeof reportApi.getReport === "function") {
    const report = reportApi.getReport();
    const glibcVersion = report?.header?.glibcVersionRuntime;
    if (glibcVersion) return "gnu";

    const sharedObjects = report?.sharedObjects;
    if (Array.isArray(sharedObjects) && sharedObjects.some((item) => typeof item === "string" && item.includes("musl"))) {
      return "musl";
    }
  }

  const lddProbe = spawnSync("ldd", ["--version"], { encoding: "utf8" });
  const lddText = `${lddProbe.stdout ?? ""}\n${lddProbe.stderr ?? ""}`.toLowerCase();
  if (lddText.includes("musl")) return "musl";
  if (lddText.includes("glibc") || lddText.includes("gnu libc")) return "gnu";

  const getconfProbe = spawnSync("getconf", ["GNU_LIBC_VERSION"], { encoding: "utf8" });
  const getconfText = `${getconfProbe.stdout ?? ""}${getconfProbe.stderr ?? ""}`;
  if (getconfProbe.status === 0 && /glibc/i.test(getconfText)) return "gnu";

  return "gnu";
}

function getPackageCandidates() {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return [{ packageName: "@sfpprxy/speak-darwin-arm64", binaryName: "speak" }];
  }

  if (process.platform === "darwin" && process.arch === "x64") {
    return [{ packageName: "@sfpprxy/speak-darwin-x64", binaryName: "speak" }];
  }

  if (process.platform === "linux" && process.arch === "x64") {
    const gnu = { packageName: "@sfpprxy/speak-linux-x64-gnu", binaryName: "speak" };
    const musl = { packageName: "@sfpprxy/speak-linux-x64-musl", binaryName: "speak" };
    return detectLinuxLibc() === "musl" ? [musl, gnu] : [gnu, musl];
  }

  if (process.platform === "linux" && process.arch === "arm64") {
    const gnu = { packageName: "@sfpprxy/speak-linux-arm64-gnu", binaryName: "speak" };
    const musl = { packageName: "@sfpprxy/speak-linux-arm64-musl", binaryName: "speak" };
    return detectLinuxLibc() === "musl" ? [musl, gnu] : [gnu, musl];
  }

  if (process.platform === "win32" && process.arch === "x64") {
    return [{ packageName: "@sfpprxy/speak-win32-x64-msvc", binaryName: "speak.exe" }];
  }

  return [];
}

function resolveBinaryPath() {
  const candidates = getPackageCandidates();
  if (candidates.length === 0) {
    throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`);
  }

  const errors = [];
  for (const candidate of candidates) {
    try {
      const packageJsonPath = require.resolve(`${candidate.packageName}/package.json`);
      const packageDir = dirname(packageJsonPath);
      return join(packageDir, "bin", candidate.binaryName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${candidate.packageName}: ${message}`);
    }
  }

  throw new Error(
    [
      "No platform binary package found.",
      `platform=${process.platform}/${process.arch}`,
      "Ensure optional dependencies are installed (avoid --omit=optional).",
      `details=${errors.join(" | ")}`,
    ].join(" "),
  );
}

function main() {
  const binaryPath = resolveBinaryPath();
  const child = spawnSync(binaryPath, process.argv.slice(2), { stdio: "inherit" });

  if (child.error) {
    console.error(`speak failed to launch binary: ${child.error.message}`);
    process.exit(1);
  }

  process.exit(child.status ?? 1);
}

main();
