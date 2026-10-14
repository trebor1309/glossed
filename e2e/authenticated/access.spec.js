import { credentialsFor } from "./helpers/credentials.js";
import { adminUrl, loginThroughAdminUi } from "./helpers/adminLogin.js";
import { loginThroughUi } from "./helpers/login.js";
import { expect, test } from "./helpers/readOnlyTest.js";
import { generateTotpCode } from "./helpers/totp.js";

const mapsConsoleError =
  /Google Maps JavaScript API error|RefererNotAllowedMapError|ApiNotActivatedMapError|BillingNotEnabledMapError/i;

async function currentProfile(page) {
  return page.evaluate(() => {
    const storedProfile = window.localStorage.getItem("glossed_user");
    return storedProfile ? JSON.parse(storedProfile) : null;
  });
}

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

test("an authenticated client sees the booking pause and can explore professionals", async ({
  page,
}) => {
  await loginThroughUi(page, credentialsFor("client"), /\/dashboard$/);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Bookings are not open yet/i)).toBeVisible();
  await page.getByRole("button", { name: "Explore professionals" }).click();

  await expect(page).toHaveURL(/\/dashboard\/discover$/);

  await page.goto("/dashboard/new", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/dashboard\/new$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Bookings are opening soon" })
  ).toBeVisible();
});

test("a client can open its account and the live professional discovery tools", async ({
  page,
}) => {
  const googleMapsErrors = [];
  page.on("console", (message) => {
    if (mapsConsoleError.test(message.text())) googleMapsErrors.push(message.text());
  });

  const credentials = credentialsFor("client");
  await loginThroughUi(page, credentials, /\/dashboard$/);

  await page.goto("/dashboard/account", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 2, name: "My Account" })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toHaveValue(credentials.email);

  await page.goto("/dashboard/discover", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { level: 1, name: "Who can help with your beauty request?" })
  ).toBeVisible();

  const serviceSelect = page.getByLabel("What service do you need?");
  await expect(serviceSelect).toBeEnabled();
  await expect.poll(() => serviceSelect.locator("option").count()).toBeGreaterThan(1);
  await expect(page.locator("gmp-place-autocomplete#discovery-location")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("#discovery-location-places-status")).toHaveCount(0);
  expect(googleMapsErrors).toEqual([]);
});

test("a professional session can open its notifications", async ({ page }) => {
  await loginThroughUi(page, credentialsFor("pro"), /\/prodashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");

  await page.goto("/prodashboard/notifications", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/prodashboard\/notifications$/);
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
});

test("a professional account exposes a public profile without opening bookings", async ({
  page,
}) => {
  await loginThroughUi(page, credentialsFor("pro"), /\/prodashboard$/);

  await page.goto("/prodashboard/account", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 3, name: "Business Information" })).toBeVisible();

  const profile = await currentProfile(page);
  expect(profile?.id).toMatch(/^[0-9a-f-]{36}$/i);

  await page.goto(`/profile/${profile.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("This is your public profile")).toBeVisible();
  await expect(page.getByRole("button", { name: "Contact" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bookings opening soon" })).toBeDisabled();
  await expect(page.getByText(/Bookings are not open yet/i)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Reviews" })).toBeVisible();
  await expect(page.getByText("Reviews could not be loaded. Please try again.")).toHaveCount(0);
});

test("the public contact channel is ready without sending a scheduled test message", async ({
  page,
}) => {
  await page.goto("/contact", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Contact Glossed" })).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toBeVisible();
  await expect(page.getByLabel("Email *")).toBeVisible();
  await expect(page.getByLabel("Message *")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
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
