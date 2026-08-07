import { expect } from "@playwright/test";

export async function loginThroughUi(page, credentials, expectedPath) {
  let loginFailure;

  page.on("dialog", async (dialog) => {
    loginFailure = dialog.message();
    await dialog.dismiss();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("nav").getByRole("button", { name: "Sign in" }).click();
  await page.locator('input[name="identifier"]').fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.getByRole("button", { name: "Continue" }).click();

  try {
    await expect(page).toHaveURL(expectedPath, { timeout: 20_000 });
  } catch (error) {
    if (loginFailure) {
      throw new Error(`The configured test account could not sign in: ${loginFailure}`);
    }
    throw error;
  }
}
