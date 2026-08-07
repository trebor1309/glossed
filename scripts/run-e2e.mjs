import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const playwrightCli = path.join(projectRoot, "node_modules", "@playwright", "test", "cli.js");
const usesExternalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);

let previewServer;

async function closePreviewServer() {
  if (!previewServer) return;

  previewServer.httpServer.closeAllConnections?.();
  await new Promise((resolve, reject) => {
    previewServer.httpServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  previewServer = undefined;
}

async function runPlaywright() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Playwright stopped by signal ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

async function main() {
  if (!usesExternalServer) {
    previewServer = await preview({
      root: projectRoot,
      logLevel: process.env.CI ? "warn" : "info",
      preview: {
        host: "127.0.0.1",
        port: 4173,
        strictPort: true,
      },
    });
  }

  try {
    process.exitCode = await runPlaywright();
  } finally {
    await closePreviewServer();
  }
}

main().catch(async (error) => {
  console.error(error);
  await closePreviewServer().catch(console.error);
  process.exitCode = 1;
});
