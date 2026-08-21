import { expect, test } from "@playwright/test";
import { isolateFromRemoteServices } from "./helpers/safeNetwork.js";

const protectedRoutes = [
  "/onboarding",
  "/dashboard",
  "/dashboard/payments",
  "/dashboard/messages",
  "/prodashboard",
  "/prodashboard/payments",
  "/prodashboard/messages",
];

test.beforeEach(async ({ page }) => {
  await isolateFromRemoteServices(page);
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

for (const path of protectedRoutes) {
  test(`redirects anonymous access from ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Beauty");
  });
}

test("does not expose the former admin route from the consumer application", async ({ page }) => {
  await page.goto("/admin/verifications", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Beauty");
});
