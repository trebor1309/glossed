import { expect, test as base } from "@playwright/test";

const stripeHost = /(^|\.)stripe\.com$/;
const configuredSupabaseHost = new URL(process.env.E2E_SUPABASE_URL).hostname;
const configuredTargetOrigin = new URL(process.env.PLAYWRIGHT_BASE_URL).origin;
const vercelProtectionBypass = process.env.E2E_VERCEL_BYPASS_SECRET?.trim();
const allowedSupabasePostPaths = [
  "/rest/v1/rpc/is_app_admin",
  "/rest/v1/rpc/list_pending_professional_verifications",
  "/rest/v1/rpc/get_notification_summary",
];

function isAllowedReadOnlySupabasePost(pathname) {
  return (
    pathname === "/auth/v1/token" ||
    allowedSupabasePostPaths.includes(pathname) ||
    pathname.startsWith("/storage/v1/object/sign/")
  );
}

function isSupabaseRequest(request, url) {
  const headers = request.headers();
  return url.hostname === configuredSupabaseHost || Boolean(headers.apikey);
}

export const test = base.extend({
  readOnlyGuard: [
    async ({ page }, use) => {
      const blockedWrites = [];

      await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();

        if (stripeHost.test(url.hostname)) {
          await route.abort("blockedbyclient");
          return;
        }

        if (
          isSupabaseRequest(request, url) &&
          !["GET", "HEAD", "OPTIONS"].includes(method) &&
          !(method === "POST" && isAllowedReadOnlySupabasePost(url.pathname))
        ) {
          blockedWrites.push(`${method} ${url.pathname}`);
          await route.abort("blockedbyclient");
          return;
        }

        if (vercelProtectionBypass && url.origin === configuredTargetOrigin) {
          await route.continue({
            headers: {
              ...request.headers(),
              "x-vercel-protection-bypass": vercelProtectionBypass,
              "x-vercel-set-bypass-cookie": "true",
            },
          });
          return;
        }

        await route.continue();
      });

      await use(blockedWrites);

      expect(
        blockedWrites,
        "Authenticated smoke tests must not attempt business-data writes"
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
