import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const functionsRoot = resolve("supabase/functions");
const entrypoints = readdirSync(functionsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
  .map((entry) => `${entry.name}/index.ts`)
  .filter((entrypoint) => existsSync(resolve(functionsRoot, entrypoint)));

if (entrypoints.length === 0) {
  throw new Error("No Supabase Edge Function entrypoints were found.");
}

const executable = process.platform === "win32" ? "deno.exe" : "deno";
const result = spawnSync(executable, ["check", ...entrypoints], {
  cwd: functionsRoot,
  stdio: "inherit",
  shell: false,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
