import { expect, test } from "@playwright/test";
import { installMockClientSession } from "./helpers/mockClientSession.js";

const home = {
  id: "47000000-0000-4000-8000-000000000001",
  label: "Home",
  formatted_address: "1 Home Street, Brussels",
  city: "Brussels",
  postal_code: "1000",
  country_code: "BE",
  latitude: 50.8503,
  longitude: 4.3517,
  is_default: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const work = {
  id: "47000000-0000-4000-8000-000000000002",
  label: "Work",
  formatted_address: "2 Work Avenue, Brussels",
  city: "Brussels",
  postal_code: "1000",
  country_code: "BE",
  latitude: 50.8467,
  longitude: 4.3525,
  is_default: false,
  created_at: "2026-01-02T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

async function reachAddressStep(page, targeted = true) {
  const suffix = targeted ? "?pro=40000000-0000-4000-8000-000000000020&service=hair_stylist" : "";
  await page.goto(`/dashboard/new${suffix}`, { waitUntil: "domcontentloaded" });
  if (!targeted) await page.getByRole("button", { name: /Hair Stylist/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Requested date").fill(futureDate);
  await page.getByRole("button", { name: "Morning (8–12)" }).click();
  await page.getByRole("button", { name: "Next" }).click();
}

async function installGooglePlacesMock(page) {
  await page.addInitScript(() => {
    class MockAutocomplete {
      constructor(input) {
        this.input = input;
        this.listeners = {};
        window.__glossedAutocomplete = this;
      }
      addListener(name, callback) {
        this.listeners[name] = callback;
        return { remove() {} };
      }
      getPlace() {
        return window.__glossedPlace;
      }
    }

    window.google = {
      maps: {
        places: { Autocomplete: MockAutocomplete },
        event: { clearInstanceListeners() {} },
      },
    };
    window.__selectGlossedPlace = (place) => {
      window.__glossedPlace = place;
      window.__glossedAutocomplete.listeners.place_changed();
    };
  });
}

test("uses the default saved address without loading Google and snapshots both booking paths", async ({
  page,
}) => {
  const googleRequests = [];
  page.on("request", (request) => {
    if (/googleapis|gstatic/.test(request.url())) googleRequests.push(request.url());
  });
  const { calls } = await installMockClientSession(page, {
    addressesResponse: () => [home, work],
  });

  await reachAddressStep(page);
  await expect(page.getByRole("radio", { name: /Home — Default/ })).toBeChecked();
  await expect(page.getByText(home.formatted_address)).toBeVisible();
  await expect(page.getByPlaceholder("Enter your address")).toHaveCount(0);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page).toHaveURL(/\/dashboard\/reservations$/);

  const targeted = calls.find((call) => call.path.endsWith("create_targeted_booking_request"));
  expect(targeted.body.p_address).toBe(home.formatted_address);
  expect(targeted.body.p_client_latitude).toBe(home.latitude);
  expect(targeted.body.p_client_longitude).toBe(home.longitude);
  expect(googleRequests).toEqual([]);

  await reachAddressStep(page, false);
  await page.getByRole("radio", { name: /Work/ }).check();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page).toHaveURL(/\/dashboard\/reservations$/);
  const directBooking = calls.find(
    (call) => call.path === "/rest/v1/bookings" && call.method === "POST"
  );
  const matching = calls.find((call) => call.path.endsWith("find_matching_pro_ids"));
  expect(directBooking.body[0].address).toBe(work.formatted_address);
  expect(directBooking.body[0].client_lat).toBe(work.latitude);
  expect(directBooking.body[0].client_lng).toBe(work.longitude);
  expect(matching.body.p_client_lat).toBe(work.latitude);
  expect(matching.body.p_client_lng).toBe(work.longitude);
});

test("saves a mocked Places result with a stable retry identity for the next request", async ({
  page,
}) => {
  await installGooglePlacesMock(page);
  const addresses = [{ ...home }];
  const operationIds = [];
  let attempts = 0;
  const { calls } = await installMockClientSession(page, {
    addressesResponse: () => addresses,
    createAddressResponse: (body) => {
      operationIds.push(body.p_address_id);
      attempts += 1;
      if (attempts === 1) return { status: 503, body: { message: "Temporary failure" } };
      addresses.push({
        id: body.p_address_id,
        label: body.p_label,
        formatted_address: body.p_formatted_address,
        city: body.p_city,
        postal_code: body.p_postal_code,
        country_code: body.p_country_code,
        latitude: body.p_latitude,
        longitude: body.p_longitude,
        is_default: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return [{ address_id: body.p_address_id, is_default: false, idempotent: true }];
    },
  });

  await reachAddressStep(page);
  await page.getByRole("radio", { name: "Other address" }).check();
  const addressInput = page.getByPlaceholder("Enter your address");
  await addressInput.fill("Rue du Test");
  await page.evaluate(() =>
    window.__selectGlossedPlace({
      formatted_address: "10 Rue du Test, 1000 Bruxelles, Belgium",
      address_components: [
        { long_name: "Bruxelles", short_name: "Bruxelles", types: ["locality"] },
        { long_name: "1000", short_name: "1000", types: ["postal_code"] },
        { long_name: "Belgium", short_name: "BE", types: ["country"] },
      ],
      geometry: {
        location: { lat: () => 50.851, lng: () => 4.353 },
      },
    })
  );
  await page.getByLabel("Save this address for later").check();
  await page.getByLabel("Address label").fill("Work");

  await page.getByRole("button", { name: "Next" }).click();
  await expect(
    page.getByText("Unable to save your addresses right now. Please try again.")
  ).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Confirm your request")).toBeVisible();
  expect(operationIds).toHaveLength(2);
  expect(new Set(operationIds).size).toBe(1);
  expect(calls.filter((call) => call.path.endsWith("create_my_user_address_v1"))).toHaveLength(2);

  await page.goto("/dashboard/new?pro=40000000-0000-4000-8000-000000000020&service=hair_stylist", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Next" }).click();
  await page
    .getByLabel("Requested date")
    .fill(new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Morning (8–12)" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("radio", { name: /Work/ })).toBeVisible();
  await expect(page.getByText("10 Rue du Test, 1000 Bruxelles, Belgium")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("50.851");
  await expect(page.locator("body")).not.toContainText("4.353");
});

test("keeps saved addresses usable and explains when Google is unavailable", async ({ page }) => {
  await installMockClientSession(page, { addressesResponse: () => [home] });
  await reachAddressStep(page);
  await expect(page.getByRole("radio", { name: /Home — Default/ })).toBeChecked();
  await page.getByRole("radio", { name: "Other address" }).check();
  await expect(
    page.getByText(
      "Address suggestions are temporarily unavailable. You can still use a saved address."
    )
  ).toBeVisible();
  await expect(page.getByPlaceholder("Enter your address")).toBeDisabled();
  await page.getByRole("radio", { name: /Home — Default/ }).check();
  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
});

test("manages labels, defaults and deletion from settings", async ({ page }) => {
  const addresses = [{ ...home }, { ...work }];
  await installMockClientSession(page, {
    addressesResponse: () => addresses,
    updateAddressResponse: (body) => {
      const address = addresses.find((item) => item.id === body.p_address_id);
      Object.assign(address, {
        label: body.p_label,
        formatted_address: body.p_formatted_address,
        latitude: body.p_latitude,
        longitude: body.p_longitude,
      });
      return [{ address_id: body.p_address_id }];
    },
    defaultAddressResponse: (body) => {
      addresses.forEach((address) => {
        address.is_default = address.id === body.p_address_id;
      });
      return [{ address_id: body.p_address_id, is_default: true }];
    },
    deleteAddressResponse: (body) => {
      addresses.splice(
        addresses.findIndex((address) => address.id === body.p_address_id),
        1
      );
      return [{ deleted_address_id: body.p_address_id, new_default_address_id: work.id }];
    },
  });

  await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Saved service addresses" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Label").fill("Residence");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText(/^Residence/)).toBeVisible();

  await page.getByRole("button", { name: "Make default" }).click();
  await expect(page.getByText(/^Work/)).toContainText("Default");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByText(/^Residence/)).toHaveCount(0);
});
