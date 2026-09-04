import { expect, test } from "@playwright/test";
import { credentialsFor } from "../authenticated/helpers/credentials.js";
import { loginThroughUi } from "../authenticated/helpers/login.js";

const supabaseOrigin = new URL(process.env.E2E_SUPABASE_URL).origin;
const targetOrigin = new URL(process.env.PLAYWRIGHT_BASE_URL).origin;
const vercelProtectionBypass = process.env.E2E_VERCEL_BYPASS_SECRET?.trim();
const allowedSupabasePosts = new Set([
  "/auth/v1/token",
  "/rest/v1/bookings",
  "/rest/v1/booking_notifications",
  "/rest/v1/rpc/create_targeted_booking_request",
  "/rest/v1/rpc/cancel_mission_proposal",
  "/rest/v1/rpc/create_mission_proposal",
  "/rest/v1/rpc/get_my_chat_summaries",
  "/rest/v1/rpc/get_notification_summary",
  "/rest/v1/rpc/get_public_profile",
  "/rest/v1/rpc/get_user_summary",
  "/rest/v1/rpc/is_app_admin",
  "/rest/v1/rpc/list_service_categories",
  "/rest/v1/rpc/mark_notifications_read",
]);

async function installFunctionalGuard(page) {
  const unexpectedWrites = [];
  let apiKey;

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const headers = request.headers();

    if (headers.apikey) apiKey = headers.apikey;

    if (/(^|\.)stripe\.com$/.test(url.hostname)) {
      await route.abort("blockedbyclient");
      return;
    }

    const isSupabase = url.origin === supabaseOrigin || Boolean(headers.apikey);
    if (
      isSupabase &&
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      !(method === "POST" && allowedSupabasePosts.has(url.pathname))
    ) {
      unexpectedWrites.push(`${method} ${url.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }

    if (vercelProtectionBypass && url.origin === targetOrigin) {
      await route.continue({
        headers: {
          ...headers,
          "x-vercel-protection-bypass": vercelProtectionBypass,
          "x-vercel-set-bypass-cookie": "true",
        },
      });
      return;
    }

    await route.continue();
  });

  return {
    unexpectedWrites,
    getApiKey: () => apiKey,
  };
}

async function readSupabaseSession(page) {
  return page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const value = localStorage.getItem(localStorage.key(index));
      try {
        const parsed = JSON.parse(value);
        if (parsed?.access_token && parsed?.user?.id) {
          return { accessToken: parsed.access_token, userId: parsed.user.id };
        }
      } catch {
        // Ignore non-JSON application storage entries.
      }
    }
    return null;
  });
}

async function cleanupBooking({ apiKey, bookingId, session }) {
  if (!apiKey || !bookingId || !session?.accessToken) return;

  const response = await fetch(`${supabaseOrigin}/rest/v1/rpc/cleanup_e2e_booking`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ p_booking_id: bookingId }),
  });

  if (!response.ok) {
    throw new Error(`E2E cleanup failed (${response.status}): ${await response.text()}`);
  }
}

test("client booking becomes a professional proposal and a payable client offer", async ({
  browser,
}) => {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const marker = `[E2E:${runId}]`;
  const date = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const contexts = [];
  const guards = [];
  let adminSession;
  let adminApiKey;
  let bookingId;

  try {
    const createPage = async () => {
      const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
      contexts.push(context);
      const page = await context.newPage();
      const guard = await installFunctionalGuard(page);
      guards.push(guard);
      return { page, guard };
    };

    const { page: proPage } = await createPage();
    await loginThroughUi(proPage, credentialsFor("pro"), /\/prodashboard$/);
    const proSession = await readSupabaseSession(proPage);
    expect(proSession?.userId).toBeTruthy();

    const { page: adminPage, guard: adminGuard } = await createPage();
    await loginThroughUi(adminPage, credentialsFor("admin"), /\/(?:pro)?dashboard$/);
    adminSession = await readSupabaseSession(adminPage);
    adminApiKey = adminGuard.getApiKey();
    expect(adminSession?.accessToken).toBeTruthy();
    expect(adminApiKey).toBeTruthy();

    const { page: clientPage } = await createPage();
    await loginThroughUi(clientPage, credentialsFor("client"), /\/dashboard$/);
    await clientPage.goto(`/dashboard/new?pro=${proSession.userId}`, {
      waitUntil: "domcontentloaded",
    });

    const serviceButton = clientPage.locator('button[aria-pressed="false"]').first();
    await expect(serviceButton).toBeVisible({ timeout: 20_000 });
    const service = (await serviceButton.locator("span").first().innerText()).trim();
    await serviceButton.click();
    await clientPage.getByRole("button", { name: /Next/ }).click();

    await clientPage.locator('input[type="date"]').fill(date);
    await clientPage.getByRole("button", { name: "Morning (8–12)" }).click();
    await clientPage.getByRole("button", { name: /Next/ }).click();

    const addressInput = clientPage.getByPlaceholder("Enter your address");
    const address = await addressInput.inputValue();
    expect(address.trim()).not.toBe("");
    await clientPage
      .getByPlaceholder("Additional notes...")
      .fill(`${marker} disposable booking-offer lifecycle`);
    await clientPage.getByRole("button", { name: /Next/ }).click();

    const bookingResponsePromise = clientPage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/rest/v1/rpc/create_targeted_booking_request"
    );
    await clientPage.getByRole("button", { name: "Send request" }).click();
    const bookingResponse = await bookingResponsePromise;
    expect(bookingResponse.ok()).toBe(true);
    const bookingPayload = await bookingResponse.json();
    bookingId = (Array.isArray(bookingPayload) ? bookingPayload[0] : bookingPayload)?.booking_id;
    expect(bookingId).toBeTruthy();

    await expect(clientPage).toHaveURL(/\/dashboard\/reservations$/, { timeout: 20_000 });
    const clientPending = clientPage.getByRole("listitem").filter({ hasText: address });
    await expect(clientPending).toHaveCount(1);
    await expect(clientPending).toContainText("pending");

    await proPage.goto("/prodashboard/missions", { waitUntil: "domcontentloaded" });
    const proPending = proPage.getByRole("listitem").filter({ hasText: address });
    await expect(proPending).toHaveCount(1, { timeout: 20_000 });
    await proPending.getByRole("button", { name: "View" }).click();
    await expect(proPage.getByText(address, { exact: true })).toBeVisible();
    await proPage.getByRole("button", { name: "Make proposal" }).click();

    await expect(proPage.getByLabel("Time")).toHaveValue("08:00");
    await proPage.getByLabel("Service price (€)").fill("42.31");
    await proPage.getByLabel("Travel fee (€)").fill("3.21");
    await proPage.getByLabel("Remark").fill(`${marker} professional proposal`);
    const proposalResponsePromise = proPage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/rest/v1/rpc/create_mission_proposal"
    );
    await proPage.getByRole("button", { name: "Send proposal" }).click();
    const proposalResponse = await proposalResponsePromise;
    expect(proposalResponse.ok()).toBe(true);
    const proposalPayload = await proposalResponse.json();
    const createdProposal = Array.isArray(proposalPayload) ? proposalPayload[0] : proposalPayload;
    expect(createdProposal?.booking_id).toBe(bookingId);

    await clientPage.goto("/dashboard/reservations", { waitUntil: "domcontentloaded" });
    const clientOffer = clientPage.getByRole("listitem").filter({ hasText: address });
    await expect(clientOffer).toHaveCount(1, { timeout: 20_000 });
    await expect(clientOffer).toContainText("offers");
    await clientOffer.getByRole("button", { name: `View offers for ${service}` }).click();

    const offersDialog = clientPage.getByRole("heading", { name: "Offers for your request" });
    await expect(offersDialog).toBeVisible();
    await expect(clientPage.getByText("50.07 €", { exact: true })).toBeVisible();
    await expect(clientPage.getByRole("button", { name: "Pay & Confirm" })).toBeVisible();
    await expect(clientPage.getByText("Professional", { exact: true })).toHaveCount(0);

    await proPage.goto("/prodashboard/missions", { waitUntil: "domcontentloaded" });
    const proposalSection = proPage.getByRole("heading", { name: "Proposals Sent" }).locator("..");
    const proposal = proposalSection.getByRole("listitem").filter({ hasText: date });
    await expect(proposal).toHaveCount(1, { timeout: 20_000 });
    await proposal.getByRole("button", { name: "View details" }).click();
    await proPage.getByRole("button", { name: "Cancel proposal" }).click();
    await proPage.getByRole("button", { name: "Cancel proposal" }).last().click();

    await clientPage.goto("/dashboard/reservations", { waitUntil: "domcontentloaded" });
    const restoredPending = clientPage.getByRole("listitem").filter({ hasText: address });
    await expect(restoredPending).toHaveCount(1, { timeout: 20_000 });
    await expect(restoredPending).toContainText("pending");
  } finally {
    await cleanupBooking({
      apiKey: adminApiKey,
      bookingId,
      session: adminSession,
    });

    for (const guard of guards) {
      expect(guard.unexpectedWrites).toEqual([]);
    }
    await Promise.all(contexts.map((context) => context.close()));
  }
});
