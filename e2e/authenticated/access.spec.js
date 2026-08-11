import { credentialsFor } from "./helpers/credentials.js";
import { loginThroughUi } from "./helpers/login.js";
import { expect, test } from "./helpers/readOnlyTest.js";

test("a client session survives reload and cannot enter pro or admin routes", async ({ page }) => {
  await loginThroughUi(page, credentialsFor("client"), /\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");

  await page.goto("/dashboard/notifications", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/notifications$/);
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();

  await page.goto("/prodashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/admin/verifications", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a professional can use pro routes but cannot enter the admin review", async ({ page }) => {
  await loginThroughUi(page, credentialsFor("pro"), /\/prodashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");

  await page.goto("/prodashboard/missions", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/prodashboard\/missions$/);
  await expect(page.getByRole("heading", { level: 1, name: "My Missions" })).toBeVisible();

  await page.goto("/prodashboard/notifications", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/prodashboard\/notifications$/);
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();

  await page.goto("/admin/verifications", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("an administrator can open the read-only verification queue", async ({ page }) => {
  await loginThroughUi(page, credentialsFor("admin"), /\/(?:pro)?dashboard$/);

  await page.goto("/admin/verifications", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/verifications$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Professional verification" })
  ).toBeVisible();
  await expect(page.getByText(/No verification request is waiting|Pending/).first()).toBeVisible();
});

for (const account of [
  { role: "client", home: /\/dashboard$/, messages: "/dashboard/messages" },
  { role: "pro", home: /\/prodashboard$/, messages: "/prodashboard/messages" },
]) {
  test(`${account.role} conversations resolve profiles and fit a mobile viewport`, async ({
    page,
  }) => {
    await loginThroughUi(page, credentialsFor(account.role), account.home);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(account.messages, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
    await expect(page.getByText("Unable to load conversations. Please try again.")).toHaveCount(0);

    const conversationButtons = page.locator("ul > li > button");
    if ((await conversationButtons.count()) > 0) {
      const firstConversation = conversationButtons.first();
      await expect(firstConversation).not.toContainText(/Unknown user|Glossed user/);
      await expect(firstConversation.locator('img, [role="img"]').first()).toBeVisible();
    }

    const viewport = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);
  });
}
