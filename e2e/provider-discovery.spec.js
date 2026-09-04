import { expect, test } from "@playwright/test";
import { installMockClientSession } from "./helpers/mockClientSession.js";

async function searchFromSavedLocation(page, service = "hair_stylist") {
  await page.goto("/dashboard/discover", { waitUntil: "domcontentloaded" });
  await page.getByLabel("What service do you need?").selectOption(service);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

test("searches by canonical service, saved location and radius with pagination", async ({
  page,
}) => {
  const { calls, providerId } = await installMockClientSession(page, {
    searchResponse: (body) => {
      const offset = body.p_page === 1 ? 0 : 6;
      return [
        {
          provider_id: body.p_page === 1 ? providerId : "40000000-0000-4000-8000-000000000021",
          username: `provider-${offset + 1}`,
          business_name: body.p_page === 1 ? "Studio Rose" : "Studio Iris",
          description: "Personalized service",
          profile_photo: null,
          service_codes: ["hair_stylist"],
          city: "Brussels",
          country: "BE",
          verification_status: "verified",
          distance_km: body.p_page === 1 ? 2.3 : 4.8,
          public_service_radius_km: 25,
          total_count: 7,
        },
      ];
    },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await searchFromSavedLocation(page);

  await expect(page.getByText("7 professionals found")).toBeVisible();
  await expect(page.getByText("about 2.3 km away")).toBeVisible();
  await expect(page.getByText("Accepting new requests")).toBeVisible();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();

  const firstSearch = calls.find((call) => call.path.endsWith("search_provider_profiles"));
  expect(firstSearch.body).toEqual({
    p_service_code: "hair_stylist",
    p_search_latitude: 50.8503,
    p_search_longitude: 4.3517,
    p_search_radius_km: 20,
    p_page: 1,
    p_page_size: 6,
  });

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Studio Iris")).toBeVisible();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
});

test("shows an explicit empty state when no professional matches", async ({ page }) => {
  await installMockClientSession(page, { searchResponse: () => [] });
  await searchFromSavedLocation(page, "barber");
  await expect(page.getByRole("heading", { name: "No professionals found" })).toBeVisible();
});

test("opens the existing profile and sends one targeted logical request across a retry", async ({
  page,
}) => {
  let attempt = 0;
  const operationIds = [];
  const { calls } = await installMockClientSession(page, {
    targetedResponse: async (body) => {
      operationIds.push(body.p_operation_id);
      attempt += 1;
      if (attempt === 1) {
        return { status: 503, body: { message: "Temporary network interruption" } };
      }
      return {
        body: [
          {
            booking_id: "40000000-0000-4000-8000-000000000100",
            notification_id: "40000000-0000-4000-8000-000000000101",
            idempotent: true,
          },
        ],
      };
    },
  });

  await searchFromSavedLocation(page);
  await page.getByRole("button", { name: "View profile" }).click();
  await expect(page).toHaveURL(
    /\/profile\/40000000-0000-4000-8000-000000000020\?service=hair_stylist$/
  );
  await expect(page.getByRole("heading", { name: "Studio Rose" })).toBeVisible();

  await page.getByRole("button", { name: "Book a Service" }).click();
  await expect(page).toHaveURL(/\/dashboard\/new\?.*operation=[0-9a-f-]{36}/);
  await expect(page.getByRole("button", { name: /Hair Stylist/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.getByRole("button", { name: "Next" }).click();

  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.getByLabel("Requested date").fill(futureDate);
  await page.getByRole("button", { name: "Morning (8–12)" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByPlaceholder("Additional notes...").fill("Personalized discovery request");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "Send request" }).dblclick();
  await expect(page.getByText("Temporary network interruption")).toBeVisible();
  expect(operationIds).toHaveLength(1);

  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page).toHaveURL(/\/dashboard\/reservations$/, { timeout: 10_000 });
  expect(operationIds).toHaveLength(2);
  expect(new Set(operationIds).size).toBe(1);
  expect(
    calls.filter((call) => call.path.endsWith("create_targeted_booking_request"))
  ).toHaveLength(2);
  expect(calls.some((call) => call.path === "/rest/v1/bookings" && call.method === "POST")).toBe(
    false
  );
  expect(
    calls.some((call) => call.path === "/rest/v1/booking_notifications" && call.method === "POST")
  ).toBe(false);
});

test("keeps the backend authoritative when the professional becomes unavailable", async ({
  page,
}) => {
  await installMockClientSession(page, {
    targetedResponse: () => ({
      status: 409,
      body: { message: "Professional is not accepting discoverable requests" },
    }),
  });

  await page.goto("/dashboard/new?pro=40000000-0000-4000-8000-000000000020&service=hair_stylist", {
    waitUntil: "domcontentloaded",
  });
  await expect(page).toHaveURL(/operation=[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Next" }).click();
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.getByLabel("Requested date").fill(futureDate);
  await page.getByRole("button", { name: "Morning (8–12)" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Send request" }).click();

  await expect(
    page.getByText(
      "This professional is no longer accepting new requests. Please choose another professional."
    )
  ).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/new/);
});
