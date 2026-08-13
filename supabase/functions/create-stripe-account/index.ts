import {
  accountInclude,
  retrieveConnectAccount,
  stripe,
  syncConnectAccount,
} from "../_shared/connect-v2.ts";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

const appUrl = (Deno.env.get("APP_URL") ?? "https://glossed.vercel.app").replace(/\/$/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const authUser = await requireUser(req);
    const { data: profile, error } = await admin
      .from("users")
      .select("role, first_name, last_name, business_name")
      .eq("id", authUser.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile) throw new HttpError(404, "Profile not found");
    if (profile.role !== "pro") throw new HttpError(403, "A professional profile is required");

    const { data: reservations, error: reservationError } = await admin.rpc(
      "reserve_provider_connect_account_creation",
      { p_provider_id: authUser.id }
    );
    if (reservationError) throw reservationError;
    const reservation = reservations?.[0];
    if (!reservation) throw new Error("Connect account reservation failed");

    let accountId = reservation.stripe_account_id as string | null;
    if (reservation.should_create) {
      const account = await stripe.v2.core.accounts.create(
        {
          contact_email: authUser.email,
          display_name:
            profile.business_name ||
            [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
            undefined,
          dashboard: "express",
          defaults: {
            currency: "eur",
            responsibilities: {
              fees_collector: "application",
              losses_collector: "application",
            },
          },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: { requested: true },
                },
              },
            },
          },
          include: [...accountInclude],
        },
        { idempotencyKey: reservation.idempotency_key }
      );
      accountId = account.id;
      const { data: completedAccount, error: completionError } = await admin.rpc(
        "complete_provider_connect_account_creation",
        {
          p_provider_id: authUser.id,
          p_stripe_account_id: accountId,
          p_livemode: Boolean(account.livemode),
        }
      );
      if (completionError) throw completionError;
      if (!completedAccount) throw new Error("Connect account completion failed");
      await syncConnectAccount(account, {
        id: `account-create:${account.id}`,
        type: "v2.core.account.created",
        createdAt: new Date(),
        livemode: Boolean(account.livemode),
        source: "account_creation",
        expectedRevision: completedAccount.revision,
      });
    } else if (accountId) {
      const { data: accountState, error: accountStateError } = await admin
        .from("provider_connect_accounts")
        .select("stripe_account_id, revision")
        .eq("provider_id", authUser.id)
        .single();
      if (accountStateError) throw accountStateError;
      if (accountState.stripe_account_id !== accountId) {
        throw new Error("Connect account changed while preparing the account check");
      }
      const account = await retrieveConnectAccount(accountId);
      await syncConnectAccount(account, {
        id: `account-check:${account.id}:${crypto.randomUUID()}`,
        type: "v2.core.account.polled",
        createdAt: new Date(),
        livemode: Boolean(account.livemode),
        source: "account_check",
        expectedRevision: accountState.revision,
      });
    }

    if (!accountId) throw new Error("Connect account reservation did not return an account");

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/prodashboard/stripe/refresh`,
      return_url: `${appUrl}/prodashboard/stripe/success`,
      type: "account_onboarding",
    });

    return json(req, { account_id: accountId, url: accountLink.url });
  } catch (error) {
    return errorResponse(req, error);
  }
});
