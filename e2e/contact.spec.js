import { expect, test } from "@playwright/test";
import { isolateFromRemoteServices } from "./helpers/safeNetwork.js";

test.beforeEach(async ({ page }) => {
  await isolateFromRemoteServices(page);
});

test("submits a real contact request and displays its reference", async ({ page }) => {
  let submitted;
  await page.route("**/functions/v1/submit-contact-request", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, reference: "A1000000" }),
    });
  });

  await page.goto("/contact?topic=professional", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Topic *")).toHaveValue("professional");
  await page.getByLabel("Your name *").fill("Jane Doe");
  await page.getByLabel("Email *").fill("jane@example.test");
  await page.getByLabel("Subject").fill("Professional onboarding");
  await page
    .getByLabel("Message *")
    .fill("I need help completing the professional onboarding process.");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText("Message received")).toBeVisible();
  await expect(page.getByText("Reference A1000000")).toBeVisible();
  expect(submitted).toMatchObject({
    category: "professional",
    name: "Jane Doe",
    email: "jane@example.test",
    subject: "Professional onboarding",
  });
  expect(submitted.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(submitted.sourcePath).toBe("/contact?topic=professional");
});
