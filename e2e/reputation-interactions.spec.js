import { expect, test } from "@playwright/test";
import { installMockClientSession } from "./helpers/mockClientSession.js";

const clientId = "40000000-0000-4000-8000-000000000010";
const providerId = "40000000-0000-4000-8000-000000000020";
const reviewId = "40000000-0000-4000-8000-000000000410";

const baseReview = {
  id: reviewId,
  rating: 4,
  comment: "Une prestation soignée et ponctuelle.",
  created_at: "2026-09-01T10:35:00.000Z",
  reviewer_username: "cliente-test",
  reviewer_profile_photo: null,
  verified_glossed_service: true,
  provider_reply: null,
  provider_replied_at: null,
};

const providerSessionProfile = {
  id: providerId,
  email: "studio-rose@example.test",
  username: "studio-rose",
  first_name: "Rose",
  last_name: "Martin",
  active_role: "pro",
  role: "pro",
  onboarding_completed: true,
  verification_status: "verified",
};

async function openProviderProfile(page) {
  await page.goto(`/profile/${providerId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(baseReview.comment)).toBeVisible();
}

test("shows an existing provider reply as a secondary public block", async ({ page }) => {
  await installMockClientSession(page, {
    publicReviewsResponse: () => [
      {
        ...baseReview,
        provider_reply: "Merci pour votre confiance !",
        provider_replied_at: "2026-09-02T09:15:00.000Z",
      },
    ],
    reviewSummaryResponse: () => [{ average_rating: 4, review_count: 1 }],
  });

  await openProviderProfile(page);
  await expect(page.getByText("Réponse du professionnel")).toBeVisible();
  await expect(page.getByText("Merci pour votre confiance !")).toBeVisible();
  await expect(page.getByText(/Réponse publiée le/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Répondre" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Signaler" })).toBeVisible();
});

test("only the reviewed professional sees the reply action", async ({ page }) => {
  await installMockClientSession(page, {
    currentProfile: providerSessionProfile,
    publicReviewsResponse: () => [baseReview],
  });

  await openProviderProfile(page);
  await expect(page.getByRole("button", { name: "Répondre" })).toBeVisible();

  await page.getByRole("button", { name: "Répondre" }).click();
  await expect(page.getByRole("dialog", { name: "Répondre à l’avis" })).toBeVisible();
  await expect(page.getByLabel("Votre réponse")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Répondre à l’avis" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Répondre" })).toBeFocused();
});

test("another user cannot reply and an anonymous visitor cannot report", async ({ page }) => {
  await installMockClientSession(page, { publicReviewsResponse: () => [baseReview] });
  await openProviderProfile(page);
  await expect(page.getByRole("button", { name: "Répondre" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Signaler" })).toBeVisible();

  await installMockClientSession(page, {
    anonymous: true,
    publicReviewsResponse: () => [baseReview],
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(baseReview.comment)).toBeVisible();
  await expect(page.getByRole("button", { name: "Répondre" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Signaler" })).toHaveCount(0);
});

test("retries one logical reply and renders it immediately", async ({ page }) => {
  let attempt = 0;
  const bodies = [];
  await installMockClientSession(page, {
    currentProfile: providerSessionProfile,
    publicReviewsResponse: () => [baseReview],
    submitReviewReplyResponse: async (body) => {
      bodies.push(body);
      attempt += 1;
      if (attempt === 1) {
        return { status: 503, body: { message: "Temporary reply interruption" } };
      }
      return {
        body: [
          {
            reply_id: "40000000-0000-4000-8000-000000000411",
            review_id: reviewId,
            content: body.p_content,
            created_at: "2026-09-02T09:15:00.000Z",
            idempotent: false,
          },
        ],
      };
    },
  });

  await openProviderProfile(page);
  await page.getByRole("button", { name: "Répondre" }).click();
  const reply = "Merci beaucoup pour ce retour détaillé.";
  await page.getByLabel("Votre réponse").fill(`  ${reply}  `);
  await page.getByRole("button", { name: "Publier la réponse" }).click();
  await expect(page.getByRole("alert")).toContainText("n’a pas pu être publiée");
  await page.getByRole("button", { name: "Publier la réponse" }).dblclick();

  await expect(page.getByText(reply)).toBeVisible();
  await expect(page.getByRole("button", { name: "Répondre" })).toHaveCount(0);
  expect(bodies).toHaveLength(2);
  expect(new Set(bodies.map((body) => body.p_operation_id)).size).toBe(1);
  expect(bodies[1].p_content).toBe(reply);
});

test("blocks an oversized reply in the form", async ({ page }) => {
  let calls = 0;
  await installMockClientSession(page, {
    currentProfile: providerSessionProfile,
    publicReviewsResponse: () => [baseReview],
    submitReviewReplyResponse: async () => {
      calls += 1;
      return { body: [] };
    },
  });

  await openProviderProfile(page);
  await page.getByRole("button", { name: "Répondre" }).click();
  const textarea = page.getByLabel("Votre réponse");
  await textarea.evaluate((element) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(element, "a".repeat(2001));
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Publier la réponse" }).click();
  await expect(page.getByRole("alert")).toContainText("La réponse ne peut pas dépasser");
  expect(calls).toBe(0);
});

test("reports with canonical reasons, validates other and keeps the review visible", async ({
  page,
}) => {
  let attempt = 0;
  const bodies = [];
  await installMockClientSession(page, {
    publicReviewsResponse: () => [baseReview],
    reportReviewResponse: async (body) => {
      bodies.push(body);
      attempt += 1;
      if (attempt === 1) return { status: 503, body: { message: "Temporary report interruption" } };
      return {
        body: [
          {
            report_id: "40000000-0000-4000-8000-000000000412",
            review_id: reviewId,
            reason_code: body.p_reason_code,
            status: "open",
            created_at: "2026-09-02T10:00:00.000Z",
            idempotent: false,
          },
        ],
      };
    },
  });

  await openProviderProfile(page);
  await page.getByRole("button", { name: "Signaler" }).click();
  await expect(page.getByRole("dialog", { name: "Signaler cet avis" })).toBeVisible();
  await expect(page.getByLabel("Motif du signalement")).toBeFocused();
  expect(
    await page
      .getByLabel("Motif du signalement")
      .locator("option")
      .evaluateAll((options) => options.slice(1).map((option) => option.value))
  ).toEqual([
    "abusive_or_hateful",
    "personal_or_sensitive_info",
    "spam_or_commercial",
    "off_topic_or_misleading",
    "other",
  ]);
  await page.getByLabel("Motif du signalement").selectOption("other");
  await page.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(page.getByText(/Ajoutez une explication/)).toBeVisible();

  const privateExplanation = "Contexte privé à examiner par Glossed";
  await page.getByLabel(/Explication/).fill(privateExplanation);
  await page.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(page.getByRole("alert")).toContainText("n’a pas pu être envoyé");
  await page.getByRole("button", { name: "Envoyer le signalement" }).dblclick();

  await expect(page.getByText("Signalement transmis à Glossed.")).toBeVisible();
  await expect(page.getByText(baseReview.comment)).toBeVisible();
  await expect(page.getByText(privateExplanation)).toHaveCount(0);
  await expect(page.getByText("reporter_id")).toHaveCount(0);
  expect(bodies).toHaveLength(2);
  expect(new Set(bodies.map((body) => body.p_operation_id)).size).toBe(1);
  expect(bodies[1].p_reason_code).toBe("other");
  expect(bodies[1].p_explanation).toBe(privateExplanation);
});

test("blocks an oversized report explanation and presents a repeated report cleanly", async ({
  page,
}) => {
  let calls = 0;
  await installMockClientSession(page, {
    publicReviewsResponse: () => [baseReview],
    reportReviewResponse: async () => {
      calls += 1;
      return {
        status: 409,
        body: { code: "23505", message: "This user already reported the review" },
      };
    },
  });

  await openProviderProfile(page);
  await page.getByRole("button", { name: "Signaler" }).click();
  await page.getByLabel("Motif du signalement").selectOption("abusive_or_hateful");
  const explanation = page.getByLabel(/Explication/);
  await explanation.evaluate((element) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(element, "b".repeat(1001));
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(page.getByText(/^L’explication ne peut pas dépasser/)).toBeVisible();
  expect(calls).toBe(0);

  await explanation.fill("");
  await page.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(page.getByText("Vous aviez déjà signalé cet avis.")).toBeVisible();
  await expect(page.getByText(baseReview.comment)).toBeVisible();
  expect(calls).toBe(1);
});

test("renders safe reputation notifications and opens the review anchor", async ({ page }) => {
  const privateData = "PRIVATE REPORT REASON reporter@example.test admin note";
  await installMockClientSession(page, {
    notificationsResponse: () => [
      {
        id: "40000000-0000-4000-8000-000000000501",
        event_type: "review_reply_received",
        title: "Raw reply title",
        body: "Raw reply body",
        metadata: { path: `/profile/${providerId}`, review_id: reviewId },
        read_at: null,
        created_at: "2026-09-08T09:00:00.000Z",
      },
      {
        id: "40000000-0000-4000-8000-000000000502",
        event_type: "review_moderation_decided",
        title: privateData,
        body: privateData,
        metadata: { path: `/profile/${providerId}`, review_id: reviewId },
        read_at: "2026-09-08T09:01:00.000Z",
        created_at: "2026-09-08T09:01:00.000Z",
      },
    ],
    publicReviewsResponse: () => [baseReview],
  });

  await page.goto("/dashboard/notifications", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Réponse à votre avis", { exact: true })).toBeVisible();
  await expect(page.getByText("Mise à jour concernant un avis", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Glossed a terminé l’examen d’un avis signalé.", { exact: true })
  ).toBeVisible();
  await expect(page.getByText(privateData)).toHaveCount(0);

  await page.getByRole("button", { name: /Réponse à votre avis/ }).click();
  await expect(page).toHaveURL(new RegExp(`/profile/${providerId}#reviews$`));
});

test("does not invent placeholders for hidden or removed reviews", async ({ page }) => {
  await installMockClientSession(page, {
    publicReviewsResponse: () => [],
    reviewSummaryResponse: () => [{ average_rating: null, review_count: 0 }],
  });

  await page.goto(`/profile/${providerId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("No reviews yet")).toHaveCount(2);
  await expect(page.getByText(/avis (masqué|retiré|supprimé)/i)).toHaveCount(0);
});
