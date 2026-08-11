import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const localEnvironmentFile = path.join(projectRoot, ".env.e2e.auth");
const playwrightCli = path.join(projectRoot, "node_modules", "@playwright", "test", "cli.js");

if (existsSync(localEnvironmentFile)) {
  process.loadEnvFile(localEnvironmentFile);
}

const requiredVariables = [
  "E2E_BASE_URL",
  "E2E_SUPABASE_URL",
  "E2E_CLIENT_EMAIL",
  "E2E_CLIENT_PASSWORD",
  "E2E_PRO_EMAIL",
  "E2E_PRO_PASSWORD",
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
];

const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());

if (missingVariables.length > 0) {
  throw new Error(`Missing functional E2E configuration: ${missingVariables.join(", ")}`);
}

if (
  process.env.E2E_ENABLE_WRITES !== "true" ||
  process.env.E2E_FUNCTIONAL_CONFIRMATION !== "disposable-test-data"
) {
  throw new Error(
    "Functional E2E writes are disabled. Set E2E_ENABLE_WRITES=true and " +
      "E2E_FUNCTIONAL_CONFIRMATION=disposable-test-data for the dedicated test environment."
  );
}

const targetUrl = new URL(process.env.E2E_BASE_URL);
const supabaseUrl = new URL(process.env.E2E_SUPABASE_URL);

if (targetUrl.protocol !== "https:" || supabaseUrl.protocol !== "https:") {
  throw new Error("Functional remote E2E targets must use HTTPS.");
}

const accountEmails = [
  process.env.E2E_CLIENT_EMAIL,
  process.env.E2E_PRO_EMAIL,
  process.env.E2E_ADMIN_EMAIL,
].map((email) => email.trim().toLowerCase());

if (new Set(accountEmails).size !== accountEmails.length) {
  throw new Error("Functional E2E accounts must be distinct.");
}

process.env.PLAYWRIGHT_BASE_URL = targetUrl.origin;

const child = spawn(
  process.execPath,
  [playwrightCli, "test", "--config", "playwright.functional.config.js", ...process.argv.slice(2)],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  }
);

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`Functional Playwright tests stopped by signal ${signal}`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
