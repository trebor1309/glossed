import { expect, test } from "@playwright/test";
import { installMockAdminSession } from "./helpers/mockAdminSession.js";

const providerId = "9b000000-0000-4000-8000-000000000020";

test("suspends a provider and records a versioned eligibility decision", async ({ page }) => {
  await installMockAdminSession(page, {
    initialPath: `/utilisateurs/${providerId}`,
    permissions: ["admin.access", "users.read", "users.manage", "verification.review"],
    roles: ["support", "verification"],
  });
  const state = {
    accountStatus: "active",
    accountHistory: [],
    eligibility: null,
    eligibilityHistory: [],
  };
  const detail = {
    profile: {
      id: providerId,
      email: "provider-controls@example.test",
      first_name: "Rose",
      last_name: "Martin",
      business_name: "Studio Rose",
      role: "pro",
      active_role: "pro",
      profile_status: "complete",
      phone_number: "+32000000000",
      city: "Malmedy",
      country: "BE",
      company_number: "BE0123456789",
      vat_number: "BE0123456789",
      no_vat: false,
      verification_status: "verified",
      created_at: "2026-09-01T10:00:00.000Z",
    },
    eligibility_declaration: {
      id: "9b000000-0000-4000-8000-000000000201",
      residence_country_code: "BE",
      service_country_code: "BE",
      provider_status_code: "sole_trader",
      trader_classification: "trader",
    },
    connect_account: null,
    verification_history: [],
    activity: { requests_created: 0, proposals_created: 0, missions_as_client: 0, recent_missions: [] },
  };
  const policy = {
    version: "be_marketplace_v1",
    jurisdiction_code: "BE",
    residence_country_code: "BE",
    service_country_code: "BE",
    provider_status_code: "sole_trader",
    service_category_code: null,
  };
  const calls = [];
  await page.route("**/rest/v1/rpc/admin_get_user_detail", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...detail, eligibility_assessment: state.eligibility }) })
  );
  await page.route("**/rest/v1/rpc/admin_get_user_control_context", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        account_control: { user_id: providerId, status: state.accountStatus, reason: state.accountHistory[0]?.reason || null, updated_at: "2026-10-13T10:00:00.000Z", revision: state.accountHistory.length + 1 },
        account_control_history: state.accountHistory,
        eligibility_assessment_history: state.eligibilityHistory,
        applicable_eligibility_policies: [policy],
      }),
    })
  );
  await page.route("**/functions/v1/admin-user-account-control", async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ endpoint: "account", body });
    state.accountStatus = body.target_status;
    state.accountHistory.unshift({
      id: body.operation_id,
      previous_status: "active",
      new_status: body.target_status,
      reason: body.reason,
      actor_label: "Support Test",
      created_at: "2026-10-13T10:00:00.000Z",
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: body.target_status }) });
  });
  await page.route("**/rest/v1/rpc/admin_record_provider_eligibility_assessment", async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ endpoint: "eligibility", body });
    state.eligibility = {
      id: body.p_operation_id,
      policy_version: body.p_policy_version,
      service_country_code: "BE",
      service_category_code: body.p_service_category_code,
      status: body.p_status,
      valid_until: body.p_valid_until,
      reason: body.p_reason,
      created_at: "2026-10-13T10:05:00.000Z",
    };
    state.eligibilityHistory.unshift({ ...state.eligibility, actor_label: "Support Test" });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state.eligibility) });
  });

  await page.goto("/admin.html", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Rose Martin" })).toBeVisible();
  await page.getByRole("button", { name: "Suspendre" }).click();
  await page.getByLabel("Motif détaillé").first().fill("Compte suspendu après vérification du signalement support.");
  await page.getByRole("button", { name: "Confirmer la suspension" }).click();
  await expect(page.getByText("Compte : Suspendu")).toBeVisible();
  expect(calls.find((call) => call.endpoint === "account")?.body).toMatchObject({
    target_user_id: providerId,
    target_status: "suspended",
  });

  await page.getByLabel("Décision").selectOption("eligible");
  await page.getByLabel("Valide jusqu’au").fill("2026-12-31T12:00");
  await page.getByLabel("Motif détaillé").last().fill("Les pièces contrôlées satisfont la politique sélectionnée.");
  await page.getByRole("button", { name: "Enregistrer la décision" }).click();
  await expect(page.getByText("Éligibilité : Éligible")).toBeVisible();
  expect(calls.find((call) => call.endpoint === "eligibility")?.body).toMatchObject({
    p_provider_id: providerId,
    p_policy_version: "be_marketplace_v1",
    p_status: "eligible",
    p_service_category_code: "*",
  });
});
