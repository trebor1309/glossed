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
    await page.waitForURL(
      (url) => expectedPath.test(url.pathname) || url.pathname === "/legal/accept",
      { timeout: 20_000 }
    );

    if (new URL(page.url()).pathname === "/legal/accept") {
      throw new Error(
        "The configured test account must accept the current legal documents before running the read-only authenticated suite."
      );
    }

    await expect(page).toHaveURL((url) => expectedPath.test(url.pathname));
  } catch (error) {
    if (loginFailure) {
      throw new Error(`The configured test account could not sign in: ${loginFailure}`);
    }
    throw error;
  }
}
