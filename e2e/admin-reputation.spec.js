import { expect, test } from "@playwright/test";
import { installMockAdminSession } from "./helpers/mockAdminSession.js";

async function openAdmin(page) {
  await page.goto("/admin.html", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Support Test")).toBeVisible();
}

async function openReputationDetail(page) {
  await openAdmin(page);
  await expect(page.getByRole("heading", { name: "Réputation" })).toBeVisible();
  const detailHref = await page.getByRole("link", { name: /Examiner/ }).first().getAttribute("href");
  await page.evaluate((href) => {
    window.history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, detailHref);
  await expect(page.getByRole("heading", { name: "Avis 2/5" })).toBeVisible();
}

test("hides the section and rejects its direct route without reputation.read", async ({ page }) => {
  const { calls } = await installMockAdminSession(page, {
    permissions: ["admin.access"],
    initialPath: "/reputation",
  });
  await openAdmin(page);
  await expect(page.getByRole("link", { name: /Réputation/ })).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  expect(calls.some((call) => call.path.includes("reputation"))).toBe(false);
});

test("shows counts, open/history queues and backend pagination", async ({ page }) => {
  const { calls } = await installMockAdminSession(page);
  await openAdmin(page);
  await expect(page.getByRole("heading", { name: "Réputation" })).toBeVisible();
  const reputationLink = page.getByRole("link", { name: /Réputation/ });
  await expect(reputationLink.getByLabel("2 avis signalés à traiter")).toBeVisible();

  await expect(page.getByText("21 avis signalés")).toBeVisible();
  await expect(page.getByText("cliente-test")).toBeVisible();
  await expect(page.getByText("Studio Rose")).toBeVisible();
  await expect(page.getByText(/2 ouverts \/ 2 signalements/)).toBeVisible();

  await page.getByRole("button", { name: /Suivant/ }).click();
  await expect(page.getByText("Page 2 sur 2")).toBeVisible();
  await page.getByRole("tab", { name: /Historique/ }).click();
  await expect(page).toHaveURL(/view=history/);
  await expect
    .poll(() =>
      calls.some(
        (call) =>
          call.path.endsWith("admin_list_reported_reviews") &&
          call.body.p_view === "history" &&
          call.body.p_limit === 20 &&
          call.body.p_offset === 0
      )
    )
    .toBe(true);
  await expect(page.getByText("1 avis signalé", { exact: true })).toBeVisible();

  const listCalls = calls.filter((call) => call.path.endsWith("admin_list_reported_reviews"));
  expect(listCalls.some((call) => call.body.p_limit === 20 && call.body.p_offset === 20)).toBe(true);
});

test("ignores a superseded slow open response after history has loaded", async ({ page }) => {
  let resolveOpen;
  await installMockAdminSession(page, {
    listResponse: async (body) => {
      if (body.p_view === "open") {
        return new Promise((resolve) => {
          resolveOpen = () =>
            resolve({
              view: "open",
              total: 1,
              limit: 20,
              offset: 0,
              items: [
                {
                  review_id: "45000000-0000-4000-8000-000000000401",
                  review_status: "published",
                  rating: 1,
                  comment: "Réponse obsolète de la file ouverte",
                  reviewer_name: "ancien-auteur",
                  provider_name: "Ancien prestataire",
                  report_count: 1,
                  open_report_count: 1,
                  first_reported_at: "2026-09-01T10:00:00.000Z",
                  last_reported_at: "2026-09-01T10:00:00.000Z",
                },
              ],
            });
        });
      }
      return {
        view: "history",
        total: 1,
        limit: 20,
        offset: 0,
        items: [
          {
            review_id: "45000000-0000-4000-8000-000000000402",
            review_status: "hidden",
            rating: 4,
            comment: "Dossier historique actuel",
            reviewer_name: "auteur-historique",
            provider_name: "Prestataire historique",
            report_count: 1,
            open_report_count: 0,
            first_reported_at: "2026-09-02T10:00:00.000Z",
            last_reported_at: "2026-09-02T10:00:00.000Z",
          },
        ],
      };
    },
  });
  await openAdmin(page);
  await expect(page.getByRole("heading", { name: "Réputation" })).toBeVisible();
  await expect.poll(() => typeof resolveOpen).toBe("function");

  await page.getByRole("tab", { name: /Historique/ }).click();
  await expect(page.getByText("Dossier historique actuel")).toBeVisible();
  resolveOpen();

  await expect(page.getByRole("tab", { name: /Historique/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.getByText("Dossier historique actuel")).toBeVisible();
  await expect(page.getByText("Réponse obsolète de la file ouverte")).toHaveCount(0);
});

test("keeps a previous-page escape when a page becomes empty", async ({ page }) => {
  const { calls } = await installMockAdminSession(page, {
    initialPath: "/reputation?view=open&page=2",
    listResponse: async (body) => ({
      view: body.p_view,
      total: 0,
      limit: body.p_limit,
      offset: body.p_offset,
      items: [],
    }),
  });
  await openAdmin(page);
  await expect(page.getByText("Aucun avis signalé n’attend une décision.")).toBeVisible();
  const previous = page.getByRole("button", { name: /Précédent/ });
  await expect(previous).toBeVisible();
  await expect(previous).toBeEnabled();
  await previous.click();

  await expect(page).toHaveURL(/view=open$/);
  await expect
    .poll(() =>
      calls.some(
        (call) =>
          call.path.endsWith("admin_list_reported_reviews") && call.body.p_offset === 0
      )
    )
    .toBe(true);
});

test("shows private reports, reply, business context and no finance data", async ({ page }) => {
  const { calls } = await installMockAdminSession(page, {
    permissions: ["admin.access", "reputation.read"],
  });
  await openReputationDetail(page);

  await expect(page.getByText("Réponse du professionnel")).toBeVisible();
  await expect(page.getByText("Cette explication privée contient le contexte complet du signalement.")).toBeVisible();
  await expect(page.getByText("Informations personnelles ou sensibles")).toBeVisible();
  await expect(page.getByText("Coiffure")).toBeVisible();
  await expect(page.getByText(/accès est en lecture seule/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Masquer" })).toHaveCount(0);

  expect(calls.some((call) => /finance|payment|ledger|transfer|refund/.test(call.path))).toBe(false);
});

test("retries one moderation decision with a stable operation id and refreshes the dossier", async ({ page }) => {
  let attempt = 0;
  const moderationBodies = [];
  const { state } = await installMockAdminSession(page, {
    moderateResponse: async (body) => {
      moderationBodies.push(body);
      attempt += 1;
      if (attempt === 1) {
        return { status: 503, body: { message: "Temporary moderation interruption" } };
      }
      state.detail.review.status = body.p_target_status;
      state.detail.reports = state.detail.reports.map((report) => ({
        ...report,
        status: "resolved_hidden",
        resolved_at: "2026-09-04T10:00:00.000Z",
      }));
      state.detail.status_history.push({
        id: 2,
        event_type: "hidden",
        actor_type: "administrator",
        actor_user_id: "45000000-0000-4000-8000-000000000001",
        reason: body.p_reason,
        metadata: { previous_status: "published" },
        created_at: "2026-09-04T10:00:00.000Z",
      });
      state.counts.open = 0;
      return { body: [{ review_id: body.p_review_id, status: "hidden", idempotent: false }] };
    },
  });
  await openReputationDetail(page);
  const trigger = page.getByRole("button", { name: "Masquer" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Masquer temporairement l’avis" });
  await expect(page.getByLabel("Motif obligatoire")).toBeFocused();
  await page.getByLabel("Motif obligatoire").fill("Le signalement justifie un masquage temporaire.");
  await page.getByRole("button", { name: "Masquer temporairement l’avis" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Temporary moderation interruption");
  await page.getByRole("button", { name: "Masquer temporairement l’avis" }).dblclick();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/décision a été enregistrée et auditée/)).toBeVisible();
  await expect(page.getByText("Avis masqué", { exact: true })).toBeVisible();
  expect(moderationBodies).toHaveLength(2);
  expect(new Set(moderationBodies.map((body) => body.p_operation_id)).size).toBe(1);
  expect(moderationBodies[0].p_target_status).toBe("hidden");
});

test("uses a new operation id after the failed decision payload changes", async ({ page }) => {
  let attempt = 0;
  const moderationBodies = [];
  await installMockAdminSession(page, {
    moderateResponse: async (body) => {
      moderationBodies.push(body);
      attempt += 1;
      if (attempt === 1) return { status: 503, body: { message: "Retry me" } };
      return { body: [{ review_id: body.p_review_id, status: "published", idempotent: false }] };
    },
  });
  await openReputationDetail(page);
  await page.getByRole("button", { name: "Conserver publié" }).click();
  const reason = page.getByLabel("Motif obligatoire");
  await reason.fill("Premier motif de conservation.");
  await page.getByRole("button", { name: "Conserver l’avis publié" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await reason.fill("Motif corrigé après réexamen du dossier.");
  await page.getByRole("button", { name: "Conserver l’avis publié" }).click();

  expect(moderationBodies).toHaveLength(2);
  expect(moderationBodies[0].p_operation_id).not.toBe(moderationBodies[1].p_operation_id);
});

test("offers only the canonical transitions from hidden", async ({ page }) => {
  await installMockAdminSession(page, { reviewStatus: "hidden" });
  await openReputationDetail(page);
  await expect(page.getByRole("button", { name: "Republier" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retirer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Masquer" })).toHaveCount(0);
});

test("treats removed reviews as terminal", async ({ page }) => {
  await installMockAdminSession(page, { reviewStatus: "removed" });
  await openReputationDetail(page);
  await expect(page.getByText(/aucune restauration n’est autorisée/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Republier" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retirer" })).toHaveCount(0);
});

test("keeps the moderation dialog accessible, cautious and readable on mobile dark mode", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockAdminSession(page, { theme: "dark" });
  await openReputationDetail(page);
  await page.getByRole("button", { name: "Retirer" }).click();
  const dialog = page.getByRole("dialog", { name: "Retirer définitivement l’avis" });
  await expect(dialog.getByText("Retrait définitif")).toBeVisible();
  await expect(dialog.getByText(/transition est terminale/)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-admin-theme", "dark");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retirer" })).toBeFocused();
});
