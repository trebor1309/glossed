import { expect, test } from "@playwright/test";
import { isolateFromRemoteServices } from "./helpers/safeNetwork.js";

test.beforeEach(async ({ page }) => {
  await isolateFromRemoteServices(page);
});

test("loads the separate administration entry without a public session", async ({ page }) => {
  await page.goto("/admin.html", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
  await expect(page.getByLabel("Adresse e-mail administrative")).toBeVisible();
  await expect(page.getByLabel("Mot de passe")).toBeVisible();
  await expect(page.getByText("Les comptes client et prestataire")).toBeVisible();
});

test("keeps incomplete admin locales hidden and clamps cached choices to French", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("glossed-admin-locale", "nl"));
  await page.goto("/admin.html", { waitUntil: "domcontentloaded" });

  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
});

test("keeps neutral admin content readable with the dark theme", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("glossed-admin-theme", "dark"));
  await page.goto("/admin.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-admin-theme", "dark");

  const colors = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "bg-slate-50 text-slate-700";
    probe.textContent = "Contrast probe";
    document.querySelector("#admin-root").append(probe);
    const computed = getComputedStyle(probe);
    const result = { color: computed.color, backgroundColor: computed.backgroundColor };
    probe.remove();
    return result;
  });
  expect(colors).toEqual({
    color: "rgb(226, 232, 240)",
    backgroundColor: "rgb(30, 41, 59)",
  });
});
