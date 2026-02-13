import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type TargetSpec = {
  target: string;
  outfile: string;
};

function getRepoRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return resolve(dirname(thisFile), "..");
}

const repoRoot = getRepoRoot();
const entry = resolve(repoRoot, "src", "cli.ts");

const targets: TargetSpec[] = [
  {
    target: "bun-darwin-arm64",
    outfile: resolve(repoRoot, "packages", "speak-darwin-arm64", "bin", "speak"),
  },
  {
    target: "bun-darwin-x64",
    outfile: resolve(repoRoot, "packages", "speak-darwin-x64", "bin", "speak"),
  },
  {
    target: "bun-linux-x64-baseline",
    outfile: resolve(repoRoot, "packages", "speak-linux-x64-gnu", "bin", "speak"),
  },
  {
    target: "bun-linux-arm64",
    outfile: resolve(repoRoot, "packages", "speak-linux-arm64-gnu", "bin", "speak"),
  },
  {
    target: "bun-linux-x64-musl",
    outfile: resolve(repoRoot, "packages", "speak-linux-x64-musl", "bin", "speak"),
  },
  {
    target: "bun-linux-arm64-musl",
    outfile: resolve(repoRoot, "packages", "speak-linux-arm64-musl", "bin", "speak"),
  },
  {
    target: "bun-windows-x64-baseline",
    outfile: resolve(repoRoot, "packages", "speak-win32-x64-msvc", "bin", "speak.exe"),
  },
];

async function buildOne(spec: TargetSpec): Promise<void> {
  await mkdir(dirname(spec.outfile), { recursive: true });
  await rm(spec.outfile, { force: true });

  const cmd = [process.execPath, "build", entry, "--compile", `--target=${spec.target}`, `--outfile=${spec.outfile}`];
  console.error(`[build:binaries] ${spec.target} -> ${spec.outfile}`);

  const proc = Bun.spawn({ cmd, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`build failed for ${spec.target} with exit code ${code}`);
  }
}

async function main(): Promise<void> {
  for (const spec of targets) {
    await buildOne(spec);
  }

  console.error(`[build:binaries] done (${targets.length} targets)`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[build:binaries] ${message}`);
  process.exit(1);
});
