import { expect, test } from "@playwright/test";
import { installMockClientSession } from "./helpers/mockClientSession.js";

const clientId = "40000000-0000-4000-8000-000000000010";
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
  ...home,
  id: "47000000-0000-4000-8000-000000000002",
  label: "Work",
  formatted_address: "2 Work Avenue, Brussels",
  latitude: 50.8467,
  longitude: 4.3525,
  is_default: false,
};

function pendingBooking(overrides = {}) {
  return {
    id: "47000000-0000-4000-8000-000000000100",
    client_id: clientId,
    service: "Hair Stylist",
    date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    time_slot: "Morning (8–12)",
    address: home.formatted_address,
    client_lat: home.latitude,
    client_lng: home.longitude,
    notes: "Original notes",
    status: "pending",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function installReservationMocks(page, options = {}) {
  const booking = options.booking || pendingBooking();
  let patchCount = 0;
  const result = await installMockClientSession(page, {
    addressesResponse: () => [home, work],
    bookingsResponse: async (body, calls, request) => {
      if (request.method === "GET") return [booking];
      if (request.method === "PATCH") {
        patchCount += 1;
        if (options.onPatch) return options.onPatch(body, patchCount, booking, calls);
        Object.assign(booking, body);
        return [{ id: booking.id }];
      }
      return [];
    },
  });
  return { ...result, booking, getPatchCount: () => patchCount };
}

async function openEditModal(page) {
  await page.goto("/dashboard/reservations", { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: "Edit Hair Stylist reservation" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Modifier la réservation" });
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

async function reachAddressStep(dialog) {
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog.getByText("Where should we come?")).toBeVisible();
}

async function reachRecap(dialog) {
  await reachAddressStep(dialog);
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog.getByText("Confirm your request")).toBeVisible();
}

test("opens a portalled accessible modal, traps focus and restores the edit trigger", async ({
  page,
}) => {
  await installReservationMocks(page);
  const { dialog, trigger } = await openEditModal(page);

  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#root [role='dialog']")).toHaveCount(0);
  await expect(page.locator("#root").getByText("Step 1 of 4")).toHaveCount(0);
  await expect(page.getByTestId("reservation-modal-backdrop")).toHaveClass(/bg-black\/60/);
  await expect(dialog.getByRole("button", { name: "Fermer" })).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.querySelector("[role='dialog']")?.contains(document.activeElement)
      )
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("#root")).not.toHaveAttribute("inert", "");
});

test("preserves custom snapshots and can switch to another saved address", async ({ page }) => {
  await installReservationMocks(page, {
    booking: pendingBooking({
      address: "99 Existing Custom Address, Brussels",
      client_lat: 50.81,
      client_lng: 4.41,
      notes: "A long existing note that must remain untouched while the modal opens.",
    }),
  });
  const { dialog } = await openEditModal(page);
  await reachAddressStep(dialog);

  await expect(dialog.getByRole("radio", { name: "Other address" })).toBeChecked();
  await expect(dialog.getByPlaceholder("Enter your address")).toHaveValue(
    "99 Existing Custom Address, Brussels"
  );
  await expect(dialog.getByLabel("Tell the professional what you need")).toHaveValue(
    "A long existing note that must remain untouched while the modal opens."
  );
  await expect(dialog.getByPlaceholder("Enter your address")).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Next" })).toBeEnabled();

  await dialog.getByRole("radio", { name: /Work/ }).check();
  await expect(dialog.getByText(work.formatted_address)).toBeVisible();
  await dialog.getByRole("button", { name: "Fermer" }).click();
  await expect(dialog).toHaveCount(0);
});

test("closes on authoritative update success and refreshes the dashboard", async ({ page }) => {
  const { booking, getPatchCount } = await installReservationMocks(page);
  const { dialog } = await openEditModal(page);
  await reachAddressStep(dialog);
  await expect(dialog.getByRole("radio", { name: /Home.*Default/ })).toBeChecked();

  const updatedNotes = "Updated from the reservation modal";
  await dialog.getByLabel("Tell the professional what you need").fill(updatedNotes);
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(`“${updatedNotes}”`)).toBeVisible();
  await expect(page.getByText("Booking updated!")).toBeVisible();
  expect(booking.notes).toBe(updatedNotes);
  expect(getPatchCount()).toBe(1);
});

test("blocks accidental closing while busy and preserves values for a retry", async ({ page }) => {
  let finishFirstPatch;
  const firstPatch = new Promise((resolve) => {
    finishFirstPatch = resolve;
  });
  const { getPatchCount } = await installReservationMocks(page, {
    onPatch: async (body, attempt, booking) => {
      if (attempt === 1) {
        await firstPatch;
        return { status: 503, body: { message: "Temporary update failure" } };
      }
      Object.assign(booking, body);
      return [{ id: booking.id }];
    },
  });
  const { dialog } = await openEditModal(page);
  await reachRecap(dialog);
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await expect(dialog.getByRole("button", { name: "Fermer" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.getByTestId("reservation-modal-backdrop").click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeVisible();

  finishFirstPatch();
  await expect(
    dialog.getByText("Unable to update this reservation. Please try again.")
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Previous" }).click();
  await expect(dialog.getByLabel("Tell the professional what you need")).toHaveValue(
    "Original notes"
  );
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  expect(getPatchCount()).toBe(2);
});

test("keeps a non-pending conflict open with a clear message and remains usable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await installReservationMocks(page, {
    booking: pendingBooking({ notes: "N".repeat(1200) }),
    onPatch: () => ({
      status: 406,
      body: {
        code: "PGRST116",
        message: "JSON object requested, multiple (or no) rows returned",
      },
    }),
  });
  const { dialog } = await openEditModal(page);
  const box = await dialog.boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  expect(box.height).toBeLessThanOrEqual(720);
  await expect(dialog.getByRole("button", { name: "Fermer" })).toBeVisible();

  await reachRecap(dialog);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(
    dialog.getByText("This reservation can no longer be edited because it is no longer pending.")
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
