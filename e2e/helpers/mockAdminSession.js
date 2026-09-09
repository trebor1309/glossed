const adminId = "45000000-0000-4000-8000-000000000001";
const reviewId = "45000000-0000-4000-8000-000000000100";

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeAccessToken() {
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aal: "aal2",
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "authenticated",
    session_id: "admin-reputation-e2e-session",
    sub: adminId,
    app_metadata: { account_type: "admin" },
  })}.test-signature`;
}

const baseListItem = {
  review_id: reviewId,
  review_status: "published",
  rating: 2,
  comment: "La prestation était correcte, mais le rendez-vous a commencé très tard.",
  review_created_at: "2026-09-01T10:00:00.000Z",
  reviewer_name: "cliente-test",
  provider_name: "Studio Rose",
  report_count: 2,
  open_report_count: 2,
  first_reported_at: "2026-09-02T10:00:00.000Z",
  last_reported_at: "2026-09-03T10:00:00.000Z",
  provider_reply: "Merci pour ce retour, nous en avons tenu compte.",
};

function baseDetail(status = "published") {
  return {
    review: {
      id: reviewId,
      rating: 2,
      comment: baseListItem.comment,
      status,
      created_at: "2026-09-01T10:00:00.000Z",
      status_changed_at: "2026-09-01T10:00:00.000Z",
    },
    reply: {
      content: baseListItem.provider_reply,
      published_at: "2026-09-01T12:00:00.000Z",
    },
    author: {
      id: "45000000-0000-4000-8000-000000000010",
      username: "cliente-test",
      email: "client@example.test",
    },
    provider: {
      id: "45000000-0000-4000-8000-000000000020",
      username: "studio-rose",
      business_name: "Studio Rose",
      email: "provider@example.test",
    },
    service_context: {
      mission_id: "45000000-0000-4000-8000-000000000200",
      service: "Coiffure",
      date: "2026-08-31",
      mission_status: "completed",
      delivery_outcome: "completed_normally",
      outcome_source: "client_confirmation",
      outcome_recorded_at: "2026-09-01T09:30:00.000Z",
    },
    reports: [
      {
        id: "45000000-0000-4000-8000-000000000301",
        reporter_id: "45000000-0000-4000-8000-000000000011",
        reporter_username: "signalement-prive",
        reporter_email: "reporter@example.test",
        reason_code: "personal_or_sensitive_info",
        explanation: "Cette explication privée contient le contexte complet du signalement.",
        status: "open",
        created_at: "2026-09-02T10:00:00.000Z",
        resolved_at: null,
        resolved_by: null,
        resolution_event_id: null,
      },
      {
        id: "45000000-0000-4000-8000-000000000302",
        reporter_id: "45000000-0000-4000-8000-000000000012",
        reporter_username: "autre-signalement",
        reporter_email: "other-reporter@example.test",
        reason_code: "spam_or_commercial",
        explanation: "Un second contexte privé.",
        status: "open",
        created_at: "2026-09-03T10:00:00.000Z",
        resolved_at: null,
        resolved_by: null,
        resolution_event_id: null,
      },
    ],
    status_history: [
      {
        id: 1,
        event_type: "published",
        actor_type: "client",
        actor_user_id: "45000000-0000-4000-8000-000000000010",
        reason: "Prestation Glossed confirmée.",
        metadata: {},
        created_at: "2026-09-01T10:00:00.000Z",
      },
    ],
  };
}

export async function installMockAdminSession(page, options = {}) {
  const permissions = options.permissions || [
    "admin.access",
    "reputation.read",
    "reputation.moderate",
  ];
  const accessToken = fakeAccessToken();
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "admin-reputation-refresh-token",
    user: {
      id: adminId,
      aud: "authenticated",
      role: "authenticated",
      email: "support@example.test",
      app_metadata: { account_type: "admin" },
      user_metadata: {},
    },
  };
  const state = {
    detail: structuredClone(options.detail || baseDetail(options.reviewStatus)),
    counts: { open: 2, history: 1, ...(options.counts || {}) },
  };

  await page.addInitScript(({ storedSession, initialPath }) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("glossed.admin.auth", JSON.stringify(storedSession));
    if (initialPath) window.history.replaceState({}, "", initialPath);
  }, {
    storedSession: session,
    initialPath: options.initialPath === undefined ? "/reputation" : options.initialPath,
  });

  const calls = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isSupabase =
      url.hostname.endsWith("supabase.co") ||
      (url.hostname === "127.0.0.1" && url.port === "54321");
    if (!isSupabase) {
      await route.continue();
      return;
    }

    const body = request.postDataJSON?.() || null;
    calls.push({ method: request.method(), path: url.pathname, body });
    const json = (value, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });

    if (url.pathname === "/auth/v1/user") return json(session.user);
    if (url.pathname === "/auth/v1/factors") {
      return json({
        all: [{ id: "totp-factor", factor_type: "totp", status: "verified" }],
        totp: [{ id: "totp-factor", factor_type: "totp", status: "verified" }],
        phone: [],
      });
    }
    if (url.pathname === "/rest/v1/rpc/get_my_admin_access") {
      return json({
        account_exists: true,
        authorized: true,
        display_name: "Support Test",
        roles: options.roles || ["support"],
        permissions,
      });
    }
    if (url.pathname === "/rest/v1/rpc/admin_get_my_preferences") {
      return json({ interface_locale: "fr", theme: options.theme || "light" });
    }
    if (url.pathname === "/rest/v1/rpc/admin_get_reputation_moderation_counts") {
      return json(state.counts);
    }
    if (url.pathname === "/rest/v1/rpc/admin_list_reported_reviews") {
      if (options.listResponse) return json(await options.listResponse(body, calls, state));
      const isHistory = body.p_view === "history";
      const total = isHistory ? state.counts.history : 21;
      return json({
        view: body.p_view,
        total,
        limit: body.p_limit,
        offset: body.p_offset,
        items: total > body.p_offset ? [{ ...baseListItem, open_report_count: isHistory ? 0 : 2 }] : [],
      });
    }
    if (url.pathname === "/rest/v1/rpc/admin_get_reported_review_detail") {
      return json(state.detail);
    }
    if (url.pathname === "/rest/v1/rpc/admin_moderate_review_v1") {
      if (options.moderateResponse) {
        const response = await options.moderateResponse(body, calls, state);
        if (response) return json(response.body, response.status || 200);
      }
      state.detail.review.status = body.p_target_status;
      state.detail.reports = state.detail.reports.map((report) =>
        report.status === "open"
          ? {
              ...report,
              status:
                body.p_target_status === "published"
                  ? "resolved_kept"
                  : body.p_target_status === "hidden"
                    ? "resolved_hidden"
                    : "resolved_removed",
              resolved_at: "2026-09-04T10:00:00.000Z",
              resolved_by: adminId,
            }
          : report
      );
      state.detail.status_history.push({
        id: state.detail.status_history.length + 1,
        event_type: body.p_target_status,
        actor_type: "administrator",
        actor_user_id: adminId,
        reason: body.p_reason,
        metadata: { previous_status: baseListItem.review_status },
        created_at: "2026-09-04T10:00:00.000Z",
      });
      state.counts.open = 0;
      state.counts.history = 2;
      return json([
        {
          review_id: reviewId,
          status: body.p_target_status,
          resolved_report_count: 2,
          status_event_id: 2,
          idempotent: false,
        },
      ]);
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) return json({ items: [], total: 0 });
    if (url.pathname.startsWith("/rest/v1/")) return json([]);
    return json({});
  });

  return { calls, state, adminId, reviewId };
}
