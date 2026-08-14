import { stripe, syncConnectAccount } from "../_shared/connect-v2.ts";
import { admin } from "../_shared/supabase.ts";

const webhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET") ?? "";
const handledTypes = new Set([
  "v2.core.account.created",
  "v2.core.account.updated",
  "v2.core.account.closed",
  "v2.core.account[configuration.recipient].updated",
  "v2.core.account[configuration.recipient].capability_status_updated",
  "v2.core.account[requirements].updated",
  "v2.core.account[future_requirements].updated",
]);
const payoutTypes = new Set(["payout.created", "payout.updated", "payout.paid", "payout.failed"]);

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function eventDate(value: unknown) {
  if (typeof value === "number") return new Date(value * 1000);
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const signature = req.headers.get("stripe-signature");
  if (!signature || !webhookSecret) {
    return response({ error: "Connect webhook is not configured" }, 500);
  }

  const rawBody = await req.text();
  let declaredType = "";
  try {
    const parsed = JSON.parse(rawBody);
    declaredType = typeof parsed?.type === "string" ? parsed.type : "";
  } catch {
    return response({ error: "Invalid JSON payload" }, 400);
  }

  if (payoutTypes.has(declaredType)) {
    try {
      const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
      const payout = event.data.object;
      if (payout.object !== "payout") return response({ error: "Expected a Stripe payout" }, 400);
      const stripeAccountId = typeof event.account === "string" ? event.account : "";
      if (!stripeAccountId) return response({ error: "Connected account is missing" }, 400);

      const applicationFeeId =
        typeof payout.application_fee === "string"
          ? payout.application_fee
          : payout.application_fee?.id ?? null;
      const balanceTransactionId =
        typeof payout.balance_transaction === "string"
          ? payout.balance_transaction
          : payout.balance_transaction?.id ?? null;
      let applicationFeeAmount: number | null = null;
      let balanceTransactionFee: number | null = null;
      if (applicationFeeId) {
        const fee = await stripe.applicationFees.retrieve(applicationFeeId);
        applicationFeeAmount = fee.amount;
      }
      if (balanceTransactionId) {
        const transaction = await stripe.balanceTransactions.retrieve(
          balanceTransactionId,
          {},
          { stripeAccount: stripeAccountId }
        );
        balanceTransactionFee = transaction.fee;
      }
      const localPayoutId = payout.metadata?.provider_payout_v2_id ?? null;
      const { data, error } = await admin.rpc("process_provider_payout_v2_event", {
        p_event_id: event.id,
        p_event_type: event.type,
        p_stripe_account_id: stripeAccountId,
        p_stripe_created_at: eventDate(event.created).toISOString(),
        p_livemode: event.livemode,
        p_stripe_payout_id: payout.id,
        p_local_payout_id: localPayoutId,
        p_amount_cents: payout.amount,
        p_currency: payout.currency,
        p_method: payout.method,
        p_status: payout.status,
        p_arrival_date: payout.arrival_date
          ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)
          : null,
        p_failure_code: payout.failure_code ?? null,
        p_failure_message: payout.failure_message ?? null,
        p_stripe_application_fee_id: applicationFeeId,
        p_application_fee_amount_cents: applicationFeeAmount,
        p_stripe_balance_transaction_id: balanceTransactionId,
        p_balance_transaction_fee_cents: balanceTransactionFee,
        p_payload_summary: {
          status: payout.status,
          method: payout.method,
          amount: payout.amount,
          currency: payout.currency,
        },
      });
      if (error) throw error;
      return response({ ok: true, result: data?.[0] ?? null });
    } catch (error) {
      console.error("Stripe payout webhook processing failed", error);
      return response({ error: "Invalid or failed payout event" }, 400);
    }
  }

  let notification;
  try {
    notification = await stripe.parseEventNotificationAsync(
      rawBody,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error("Invalid Stripe Connect signature", error);
    return response({ error: "Invalid Connect signature" }, 400);
  }

  try {
    if (!handledTypes.has(notification.type)) return response({ skipped: true });
    if (!("fetchRelatedObject" in notification)) {
      return response({ error: "Expected an Accounts v2 thin event" }, 400);
    }

    const account = await notification.fetchRelatedObject();
    const inserted = await syncConnectAccount(account, {
      id: notification.id,
      type: notification.type,
      createdAt: eventDate(notification.created),
      livemode: notification.livemode,
      source: "webhook",
    });

    return response({ ok: true, duplicate: !inserted });
  } catch (error) {
    console.error("Stripe Connect webhook processing failed", error);
    return response({ error: "Connect event processing failed" }, 500);
  }
});
