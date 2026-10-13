import { expect, test } from "@playwright/test";
import { installMockClientSession } from "./helpers/mockClientSession.js";

test("publishes the canonical production URL", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://www.glossed.app/"
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    "https://www.glossed.app/"
  );
});

test("keeps onboarding usable when Google Maps is unavailable", async ({ page }) => {
  await installMockClientSession(page, {
    currentProfile: {
      id: "40000000-0000-4000-8000-000000000010",
      email: "onboarding-client@example.test",
      username: "",
      phone_number: "",
      address: "",
      latitude: null,
      longitude: null,
      active_role: "client",
      role: "client",
      onboarding_completed: false,
    },
  });

  await page.goto("/onboarding", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Complete Your Profile" })).toBeVisible();
  const address = page.getByPlaceholder("Enter your private address");
  await expect(address).toBeEnabled();
  await address.fill("Route du Barrage 36, 4960 Malmedy");
  await expect(address).toHaveValue("Route du Barrage 36, 4960 Malmedy");
  await expect(
    page.getByText("Address suggestions are temporarily unavailable. Enter the address manually.")
  ).toBeVisible();
});
