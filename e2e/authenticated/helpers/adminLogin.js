import { expect } from "@playwright/test";

const configuredAdminBaseUrl = process.env.PLAYWRIGHT_ADMIN_BASE_URL;

export function adminUrl(path = "/") {
  if (!configuredAdminBaseUrl) {
    throw new Error("PLAYWRIGHT_ADMIN_BASE_URL is required for administrator E2E tests.");
  }

  return new URL(path, `${configuredAdminBaseUrl}/`).toString();
}

export async function loginThroughAdminUi(page, credentials) {
  await page.goto(adminUrl("/verifications"), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Administration" })).toBeVisible();
  await page.getByLabel(/Adresse e-mail administrative/i).fill(credentials.email);
  await page.getByLabel(/Mot de passe/i).fill(credentials.password);
  await page.getByRole("button", { name: /Continuer/i }).click();
}
