import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function usageAndExit(): never {
  console.error("usage: bun run scripts/build-one-binary.ts <bun-target> <outfile>");
  process.exit(1);
}

function getRepoRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return resolve(dirname(thisFile), "..");
}

async function main(): Promise<void> {
  const target = process.argv[2];
  const outfileArg = process.argv[3];
  if (!target || !outfileArg) usageAndExit();

  const repoRoot = getRepoRoot();
  const entry = resolve(repoRoot, "src", "cli.ts");
  const outfile = resolve(process.cwd(), outfileArg);

  await mkdir(dirname(outfile), { recursive: true });

  const cmd = [process.execPath, "build", entry, "--compile", `--target=${target}`, `--outfile=${outfile}`];
  console.error(`[build:one] ${target} -> ${outfile}`);

  const proc = Bun.spawn({ cmd, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`build failed (${target}) with exit code ${code}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[build:one] ${message}`);
  process.exit(1);
});
