import { expect, test } from "@playwright/test";
import { isolateFromRemoteServices } from "./helpers/safeNetwork.js";

test.beforeEach(async ({ page }) => {
  await isolateFromRemoteServices(page);
});

test("loads the separate administration entry without a public session", async ({ page }) => {
  await page.goto("/admin.html", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
  await expect(page.getByLabel("Adresse e-mail administrative")).toBeVisible();
  await expect(page.getByLabel("Mot de passe")).toBeVisible();
  await expect(page.getByText("Les comptes client et prestataire")).toBeVisible();
});
