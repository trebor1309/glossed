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
const placeholderVariables = requiredVariables.filter((name) => {
  const value = process.env[name] || "";
  return (
    value.includes("replace-me") || value.includes("example.test") || value.includes("your-test-")
  );
});

if (missingVariables.length > 0) {
  console.error(
    `Missing authenticated E2E configuration: ${missingVariables.join(", ")}. ` +
      "Copy .env.e2e.auth.example to .env.e2e.auth and provide dedicated test accounts."
  );
  process.exitCode = 1;
} else if (placeholderVariables.length > 0) {
  console.error(
    `Replace placeholder values for: ${placeholderVariables.join(", ")}. ` +
      "Authenticated E2E tests require dedicated test infrastructure."
  );
  process.exitCode = 1;
} else {
  const targetUrl = new URL(process.env.E2E_BASE_URL);
  const adminTargetUrl = new URL(
    process.env.E2E_ADMIN_BASE_URL?.trim() || "https://admin.glossed.app"
  );
  const supabaseUrl = new URL(process.env.E2E_SUPABASE_URL);
  const isLocalTarget = ["127.0.0.1", "localhost"].includes(targetUrl.hostname);
  const isLocalAdminTarget = ["127.0.0.1", "localhost"].includes(adminTargetUrl.hostname);
  const isLocalSupabase = ["127.0.0.1", "localhost"].includes(supabaseUrl.hostname);

  if (targetUrl.protocol !== "https:" && !isLocalTarget) {
    throw new Error("E2E_BASE_URL must use HTTPS unless it targets localhost.");
  }

  if (supabaseUrl.protocol !== "https:" && !isLocalSupabase) {
    throw new Error("E2E_SUPABASE_URL must use HTTPS unless it targets localhost.");
  }

  if (adminTargetUrl.protocol !== "https:" && !isLocalAdminTarget) {
    throw new Error("E2E_ADMIN_BASE_URL must use HTTPS unless it targets localhost.");
  }

  if (!isLocalTarget && targetUrl.origin === adminTargetUrl.origin) {
    throw new Error("Public and administrator E2E targets must use distinct origins.");
  }

  const accountEmails = [
    process.env.E2E_CLIENT_EMAIL,
    process.env.E2E_PRO_EMAIL,
    process.env.E2E_ADMIN_EMAIL,
  ].map((email) => email.trim().toLowerCase());

  if (new Set(accountEmails).size !== accountEmails.length) {
    throw new Error("Client, professional and administrator E2E accounts must be distinct.");
  }

  process.env.PLAYWRIGHT_BASE_URL = targetUrl.origin;
  process.env.PLAYWRIGHT_ADMIN_BASE_URL = adminTargetUrl.origin;

  const child = spawn(
    process.execPath,
    [playwrightCli, "test", "--config", "playwright.auth.config.js", ...process.argv.slice(2)],
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
      console.error(`Authenticated Playwright tests stopped by signal ${signal}`);
      process.exitCode = 1;
      return;
    }

    process.exitCode = code ?? 1;
  });
}
