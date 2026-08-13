import Stripe from "npm:stripe@22.5.0";
import { admin } from "./supabase.ts";

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  maxNetworkRetries: 2,
});

type Capability = {
  status?: string | null;
  status_details?: unknown;
};

type ConnectAccountShape = {
  id: string;
  object?: string;
  livemode?: boolean;
  closed?: boolean;
  dashboard?: string | null;
  applied_configurations?: string[] | null;
  requirements?: unknown;
  future_requirements?: unknown;
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: Capability;
          payouts?: Capability;
        };
      };
    };
  };
};

export const accountInclude = [
  "configuration.recipient",
  "requirements",
  "future_requirements",
] as const;

export function asConnectAccount(account: unknown): ConnectAccountShape {
  if (!account || typeof account !== "object" || !("id" in account)) {
    throw new Error("Stripe returned an invalid Connect account");
  }
  return account as ConnectAccountShape;
}

function jsonValue(value: unknown, fallback: unknown) {
  return value === undefined || value === null ? fallback : value;
}

export async function syncConnectAccount(
  accountValue: unknown,
  event: {
    id: string;
    type: string;
    createdAt: Date;
    livemode?: boolean;
    source: "webhook" | "account_creation" | "account_check";
  }
) {
  const account = asConnectAccount(accountValue);
  const balance = account.configuration?.recipient?.capabilities?.stripe_balance;
  const transfers = balance?.stripe_transfers;
  const payouts = balance?.payouts;
  const { data, error } = await admin.rpc("sync_provider_connect_account", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_stripe_account_id: account.id,
    p_stripe_created_at: event.createdAt.toISOString(),
    p_livemode: event.livemode ?? Boolean(account.livemode),
    p_dashboard: account.dashboard ?? "express",
    p_stripe_transfers_status: transfers?.status ?? "unknown",
    p_payouts_status: payouts?.status ?? "unknown",
    p_stripe_transfers_status_details: jsonValue(transfers?.status_details, []),
    p_payouts_status_details: jsonValue(payouts?.status_details, []),
    p_requirements: jsonValue(account.requirements, {}),
    p_future_requirements: jsonValue(account.future_requirements, {}),
    p_applied_configurations: account.applied_configurations ?? [],
    p_closed: Boolean(account.closed),
    p_payload_summary: {
      source: event.source,
      object: account.object ?? "v2.core.account",
    },
  });
  if (error) throw error;
  return Boolean(data);
}

export async function retrieveConnectAccount(accountId: string) {
  return await stripe.v2.core.accounts.retrieve(accountId, {
    include: [...accountInclude],
  });
}
