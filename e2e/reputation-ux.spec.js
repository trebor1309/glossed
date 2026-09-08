import { expect, test } from "@playwright/test";
import { installMockClientSession } from "./helpers/mockClientSession.js";

const missionId = "40000000-0000-4000-8000-000000000201";
const paymentId = "40000000-0000-4000-8000-000000000301";

const mission = {
  id: missionId,
  booking_id: "40000000-0000-4000-8000-000000000101",
  client_id: "40000000-0000-4000-8000-000000000010",
  pro_id: "40000000-0000-4000-8000-000000000020",
  service: "Hair Stylist",
  description: "Completed test service",
  date: "2026-09-01",
  time: "10:00:00",
  address: "Private client address",
  price: 90,
  status: "completed",
};

function lifecycle(reviewAvailable, reviewedByMe) {
  return {
    payment_id: paymentId,
    mission_id: missionId,
    request_id: mission.booking_id,
    actor_role: "client",
    scheduled_start_at: "2026-09-01T08:00:00.000Z",
    scheduled_end_at: null,
    completion_not_before_at: "2026-09-01T08:00:00.000Z",
    provider_completed_at: "2026-09-01T10:00:00.000Z",
    client_confirmed_at: "2026-09-01T10:30:00.000Z",
    problem_reported_at: null,
    release_due_at: null,
    original_release_due_at: null,
    execution_state: "concluded",
    release_state: "released",
    transfer_state: "succeeded",
    release_trigger: "client_confirmation",
    released_at: "2026-09-01T10:30:00.000Z",
    blocker_codes: [],
    transfer_succeeded_at: "2026-09-01T10:31:00.000Z",
    can_provider_complete: false,
    can_client_confirm: false,
    can_client_report_problem: false,
    review_available: reviewAvailable,
    reviewed_by_me: reviewedByMe,
  };
}

async function openCompletedMission(page) {
  await page.goto("/dashboard/reservations", { waitUntil: "domcontentloaded" });
  const completedSection = page
    .getByRole("heading", { name: "Completed Services" })
    .locator("..");
  await completedSection.getByTitle("View details").click();
}

async function ratingFills(ratingElement) {
  return ratingElement.locator("[data-rating-fill]").evaluateAll((elements) =>
    elements.map((element) => Number(element.getAttribute("data-rating-fill")))
  );
}

test("uses server review availability instead of inferring eligibility from completed status", async ({
  page,
}) => {
  await installMockClientSession(page, {
    missionsResponse: [mission],
    lifecycleResponse: () => [lifecycle(false, false)],
  });

  await openCompletedMission(page);
  await expect(page.getByText("Mission concluded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Leave a review" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Evaluate" })).toHaveCount(0);
});

test("retries one logical review, updates the mission, profile and discovery", async ({ page }) => {
  let reviewed = false;
  let published = false;
  let attempt = 0;
  const operationIds = [];
  const publicReview = {
    id: "40000000-0000-4000-8000-000000000401",
    rating: 5,
    comment: "Excellent personalized service",
    created_at: "2026-09-01T10:35:00.000Z",
    reviewer_username: "discovery-client",
    reviewer_profile_photo: null,
    verified_glossed_service: true,
  };

  const { calls, providerId } = await installMockClientSession(page, {
    missionsResponse: [mission],
    lifecycleResponse: () => [lifecycle(true, reviewed)],
    submitReviewResponse: async (body) => {
      operationIds.push(body.p_operation_id);
      attempt += 1;
      if (attempt === 1) {
        return { status: 503, body: { message: "Temporary review service interruption" } };
      }
      reviewed = true;
      published = true;
      return {
        body: [
          {
            review_id: publicReview.id,
            rating: body.p_rating,
            comment: body.p_comment,
            status: "published",
            created_at: publicReview.created_at,
            verified_glossed_service: true,
            idempotent: false,
          },
        ],
      };
    },
    reviewSummaryResponse: () => [
      { average_rating: published ? 5 : null, review_count: published ? 1 : 0 },
    ],
    publicReviewsResponse: () => (published ? [publicReview] : []),
    searchResponse: () => [
      {
        provider_id: providerId,
        username: "studio-rose",
        business_name: "Studio Rose",
        description: "Personalized hair services in Brussels.",
        profile_photo: null,
        service_codes: ["hair_stylist"],
        city: "Brussels",
        country: "BE",
        verification_status: "verified",
        distance_km: 2.3,
        public_service_radius_km: 25,
        average_rating: published ? 5 : null,
        review_count: published ? 1 : 0,
        total_count: 1,
      },
    ],
  });

  await openCompletedMission(page);
  await page.getByRole("button", { name: "Leave a review" }).click();
  await page.getByRole("button", { name: "5 stars" }).click();
  await expect(page.getByText("5 out of 5 stars selected")).toBeVisible();
  await page
    .getByPlaceholder("Tell other clients about your experience")
    .fill(publicReview.comment);

  await page.getByRole("button", { name: "Publish review" }).click();
  await expect(page.getByRole("alert")).toContainText("Temporary review service interruption");
  await page.getByRole("button", { name: "Publish review" }).dblclick();

  await expect(page.getByText("Review submitted", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Leave a review" })).toHaveCount(0);
  expect(operationIds).toHaveLength(2);
  expect(new Set(operationIds).size).toBe(1);
  expect(calls.filter((call) => call.path.endsWith("submit_review_v1"))).toHaveLength(2);

  await page.goto(`/profile/${providerId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("5.0 · 1 review")).toBeVisible();
  const perfectRatings = page.getByRole("img", { name: "5.0 out of 5 stars" });
  await expect(perfectRatings).toHaveCount(2);
  expect(await ratingFills(perfectRatings.first())).toEqual([100, 100, 100, 100, 100]);
  await expect(page.getByText(publicReview.comment)).toBeVisible();
  await expect(page.getByText("Service completed through Glossed")).toBeVisible();
  await expect(page.getByText("Private client address")).toHaveCount(0);
  await expect(page.getByText(missionId)).toHaveCount(0);

  await page.goto("/dashboard/discover", { waitUntil: "domcontentloaded" });
  await page.getByLabel("What service do you need?").selectOption("hair_stylist");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("5.0 (1)")).toBeVisible();
});

test("accepts a one-star review without a comment", async ({ page }) => {
  let reviewed = false;
  const bodies = [];
  await installMockClientSession(page, {
    missionsResponse: [mission],
    lifecycleResponse: () => [lifecycle(true, reviewed)],
    submitReviewResponse: async (body) => {
      bodies.push(body);
      reviewed = true;
      return {
        body: [
          {
            review_id: "40000000-0000-4000-8000-000000000402",
            rating: 1,
            comment: null,
            status: "published",
            created_at: "2026-09-01T10:35:00.000Z",
            verified_glossed_service: true,
            idempotent: false,
          },
        ],
      };
    },
  });

  await openCompletedMission(page);
  await page.getByRole("button", { name: "Leave a review" }).click();
  await page.getByRole("button", { name: "1 star" }).focus();
  await page.getByRole("button", { name: "1 star" }).press("Enter");
  await page.getByRole("button", { name: "Publish review" }).click();

  await expect(page.getByText("Review submitted", { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0].p_rating).toBe(1);
  expect(bodies[0].p_comment).toBe("");
});

test("shows a neutral empty profile reputation state", async ({ page }) => {
  await installMockClientSession(page);
  await page.goto("/profile/40000000-0000-4000-8000-000000000020", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByText("No reviews yet")).toHaveCount(2);
  await expect(page.getByText(/0\.0|0\/5/)).toHaveCount(0);
});

test("paginates public reviews by cursor without duplicate cards", async ({ page }) => {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    rating: index === 5 ? 1 : 5 - (index % 2),
    comment: `Published review ${index + 1}`,
    created_at: new Date(Date.UTC(2026, 8, 6 - index, 12)).toISOString(),
    reviewer_username: `client-${index + 1}`,
    reviewer_profile_photo: null,
    verified_glossed_service: true,
  }));
  const cursors = [];

  await installMockClientSession(page, {
    reviewSummaryResponse: () => [{ average_rating: 4.8, review_count: 6 }],
    publicReviewsResponse: (body) => {
      cursors.push({ createdAt: body.p_before_created_at, id: body.p_before_review_id });
      return body.p_before_review_id ? [rows[5]] : rows;
    },
  });

  await page.goto("/profile/40000000-0000-4000-8000-000000000020", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText("4.8 · 6 reviews")).toBeVisible();
  await expect(page.getByText("Published review 1")).toBeVisible();
  await expect(page.getByText("Published review 5")).toBeVisible();
  await expect(page.getByText("Published review 6")).toHaveCount(0);

  await page.getByRole("button", { name: "Show more reviews" }).click();
  await expect(page.getByText("Published review 6")).toBeVisible();
  const oneStarRating = page.getByRole("img", { name: "1.0 out of 5 stars" });
  await expect(oneStarRating).toBeVisible();
  expect(await ratingFills(oneStarRating)).toEqual([100, 0, 0, 0, 0]);
  await expect(page.getByRole("button", { name: "Show more reviews" })).toHaveCount(0);
  expect(cursors).toHaveLength(2);
  expect(cursors[1]).toEqual({ createdAt: rows[4].created_at, id: rows[4].id });
  for (const row of rows) {
    await expect(page.getByText(row.comment)).toHaveCount(1);
  }
});
