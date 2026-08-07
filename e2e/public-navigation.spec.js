import { expect, test } from "@playwright/test";
import { isolateFromRemoteServices } from "./helpers/safeNetwork.js";

const publicRoutes = [
  "/",
  "/about",
  "/services",
  "/legal",
  "/privacy",
  "/terms",
  "/faq",
  "/about-us",
  "/careers",
  "/press",
  "/blog",
  "/help-center",
  "/contact",
  "/safety",
];

test.beforeEach(async ({ page }) => {
  await isolateFromRemoteServices(page);
});

for (const path of publicRoutes) {
  test(`loads public route ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/" : path}$`));
    await expect(page.locator("main h1").first()).toBeVisible();
  });
}

test("navigates through the primary desktop links", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("nav").getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator("main h1").first()).toBeVisible();

  await page.locator("nav").getByRole("link", { name: "Services" }).click();
  await expect(page).toHaveURL(/\/services$/);
  await expect(page.getByRole("heading", { level: 1, name: "Our Services" })).toBeVisible();
});

test("opens the sign-in dialog without submitting credentials", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("nav").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Sign in" })).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("redirects an unknown route to the home page", async ({ page }) => {
  await page.goto("/route-that-does-not-exist", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Beauty");
});
