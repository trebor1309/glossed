import { expect, test } from "@playwright/test";
import { installMockClientSession } from "./helpers/mockClientSession.js";

const pausedMessage =
  "Bookings are not open yet. You can create your account and explore professional profiles in the meantime.";

test("keeps professional profiles visible while bookings are paused", async ({ page }) => {
  const { providerId } = await installMockClientSession(page, {
    bookingsEnabled: false,
    bookingsMessage: pausedMessage,
  });

  await page.goto(`/profile/${providerId}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Studio Rose" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bookings opening soon" })).toBeDisabled();
  await expect(page.getByText(pausedMessage)).toBeVisible();
});

test("replaces the booking form with a launch notice", async ({ page }) => {
  await installMockClientSession(page, {
    bookingsEnabled: false,
    bookingsMessage: pausedMessage,
  });

  await page.goto("/dashboard/new", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Bookings are opening soon" })).toBeVisible();
  await expect(page.getByText(pausedMessage)).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore professionals" })).toHaveAttribute(
    "href",
    "/dashboard/discover"
  );
  await expect(
    page.getByRole("heading", { name: "Which service(s) would you like to book?" })
  ).toHaveCount(0);
});
