const clientId = "40000000-0000-4000-8000-000000000010";
const providerId = "40000000-0000-4000-8000-000000000020";

const categories = [
  {
    code: "hair_stylist",
    translation_key: "services.hair_stylist",
    fallback_label: "Hair Stylist",
    sort_order: 10,
  },
  {
    code: "barber",
    translation_key: "services.barber",
    fallback_label: "Barber",
    sort_order: 20,
  },
];

const clientProfile = {
  id: clientId,
  email: "discovery-client@example.test",
  username: "discovery-client",
  first_name: "Test",
  last_name: "Client",
  phone_number: null,
  address: "Brussels test address",
  latitude: 50.8503,
  longitude: 4.3517,
  profile_photo: null,
  business_name: null,
  company_number: null,
  vat_number: null,
  professional_email: null,
  business_address: null,
  active_role: "client",
  role: "client",
  theme: "light",
  onboarding_completed: true,
  stripe_account_id: null,
  stripe_account_ready: false,
  payouts_enabled: false,
  verification_status: "unverified",
  verification_submitted_at: null,
  verification_rejection_reason: null,
  verified_at: null,
};

const providerProfile = {
  id: providerId,
  username: "studio-rose",
  first_name: "Rose",
  last_name: "Martin",
  role: "pro",
  business_name: "Studio Rose",
  description: "Personalized hair services in Brussels.",
  profile_photo: null,
  portfolio: [],
  business_type: ["Hair Stylist"],
  latitude: null,
  longitude: null,
  radius_km: 25,
  city: "Brussels",
  country: "BE",
  verification_status: "verified",
};

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeAccessToken() {
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "authenticated",
    sub: clientId,
  })}.test-signature`;
}

export async function installMockClientSession(page, options = {}) {
  const accessToken = fakeAccessToken();
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "mock-refresh-token",
    user: {
      id: clientId,
      aud: "authenticated",
      role: "authenticated",
      email: clientProfile.email,
      app_metadata: {},
      user_metadata: {},
    },
  };

  await page.addInitScript((storedSession) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("glossed.auth", JSON.stringify(storedSession));
  }, session);

  const calls = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "image" && url.hostname !== "127.0.0.1") {
      await route.abort("blockedbyclient");
      return;
    }

    const isSupabase =
      url.hostname.endsWith("supabase.co") ||
      (url.hostname === "127.0.0.1" && url.port === "54321");
    if (!isSupabase) {
      if (url.hostname.includes("googleapis.com") || url.hostname.includes("gstatic.com")) {
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
      return;
    }

    const body = request.postDataJSON?.() || null;
    calls.push({ method: request.method(), path: url.pathname, body, search: url.search });

    const json = async (value, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });

    if (url.pathname === "/auth/v1/user") return json(session.user);
    if (url.pathname === "/rest/v1/users") return json(clientProfile);
    if (url.pathname === "/rest/v1/rpc/get_notification_summary") {
      return json([
        {
          unread_total: 0,
          client_offers: 0,
          pro_bookings: 0,
          pro_cancellations: 0,
          payments: 0,
          verifications: 0,
          unread_messages: 0,
        },
      ]);
    }
    if (url.pathname === "/rest/v1/rpc/list_service_categories") return json(categories);
    if (url.pathname === "/rest/v1/rpc/search_provider_profiles") {
      const response = options.searchResponse
        ? await options.searchResponse(body, calls)
        : [
            {
              provider_id: providerId,
              username: providerProfile.username,
              business_name: providerProfile.business_name,
              description: providerProfile.description,
              profile_photo: null,
              service_codes: ["hair_stylist"],
              city: "Brussels",
              country: "BE",
              verification_status: "verified",
              distance_km: 2.3,
              public_service_radius_km: 25,
              total_count: 1,
            },
          ];
      return json(response);
    }
    if (url.pathname === "/rest/v1/rpc/get_public_profile") return json([providerProfile]);
    if (url.pathname === "/rest/v1/rpc/get_public_reviews") return json([]);
    if (url.pathname === "/rest/v1/rpc/create_targeted_booking_request") {
      if (options.targetedResponse) {
        const response = await options.targetedResponse(body, calls);
        return json(response.body, response.status || 200);
      }
      return json([
        {
          booking_id: "40000000-0000-4000-8000-000000000100",
          notification_id: "40000000-0000-4000-8000-000000000101",
          idempotent: false,
        },
      ]);
    }
    if (url.pathname.startsWith("/rest/v1/")) return json([]);

    return json({});
  });

  return { calls, clientId, providerId, categories };
}
