import { credentialsFor } from "./helpers/credentials.js";
import { adminUrl, loginThroughAdminUi } from "./helpers/adminLogin.js";
import { loginThroughUi } from "./helpers/login.js";
import { expect, test } from "./helpers/readOnlyTest.js";
import { generateTotpCode } from "./helpers/totp.js";

test("a client session survives reload and cannot enter pro routes", async ({ page }) => {
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
});

test("an authenticated client can start a booking from the home CTA", async ({ page }) => {
  await loginThroughUi(page, credentialsFor("client"), /\/dashboard$/);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Book Now" }).click();

  await expect(page).toHaveURL(/\/dashboard\/new$/);
  await expect(
    page.getByRole("heading", { level: 2, name: /Which service\(s\) would you like to book/ })
  ).toBeVisible();
});

test("a professional session can open its notifications", async ({ page }) => {
  await loginThroughUi(page, credentialsFor("pro"), /\/prodashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");

  await page.goto("/prodashboard/notifications", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/prodashboard\/notifications$/);
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
});

for (const role of ["client", "pro"]) {
  test(`a ${role} account is denied by the dedicated administration app`, async ({ page }) => {
    const credentials = credentialsFor(role);
    await loginThroughUi(page, credentials, role === "client" ? /\/dashboard$/ : /\/prodashboard$/);

    await loginThroughAdminUi(page, credentials);

    await expect(page).toHaveURL(adminUrl("/verifications"));
    await expect(page.getByRole("alert")).toContainText(/pas autorisé|not authorized/i);
    await expect(page.getByText("Glossed Admin", { exact: true })).toHaveCount(0);
  });
}

test("an administrator reaches the dedicated admin app and its MFA boundary", async ({ page }) => {
  const credentials = credentialsFor("admin");
  await loginThroughAdminUi(page, credentials);

  await expect(page).toHaveURL(adminUrl("/verifications"));

  if (!credentials.totpSecret) {
    await expect(page.getByText(/authentification MFA est obligatoire/i)).toBeVisible();
    await expect(page.getByText("Glossed Admin", { exact: true })).toHaveCount(0);
    return;
  }

  await page.getByLabel(/Code à six chiffres/i).fill(generateTotpCode(credentials.totpSecret));
  await page.getByRole("button", { name: /Vérifier/i }).click();

  await expect(page).toHaveURL(adminUrl("/verifications"));
  await expect(page.getByRole("heading", { level: 1, name: /Vérifications/i })).toBeVisible();
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
    await page.getByRole("link", { name: "Messages", exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`${account.messages}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible({
      timeout: 20_000,
    });
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
