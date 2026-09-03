import Stripe from "npm:stripe@22.5.0";
import {
  dispatchProviderRetransferV2,
  dispatchTransferReversalV2,
} from "../_shared/financial-remediation-v2.ts";
import {
  dispatchProviderTransferV2,
  refreshConnectForRelease,
} from "../_shared/release-transfer-v2.ts";
import { admin } from "../_shared/supabase.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { maxNetworkRetries: 2 });
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

async function finalizeRefundResolution(refundId: string, eventId: string) {
  const { data: refund, error: refundError } = await admin
    .from("refunds_v2")
    .select("resolution_id, payment_id")
    .eq("id", refundId)
    .single();
  if (refundError) throw refundError;
  const { data: resolution, error: resolutionError } = await admin
    .from("financial_resolutions_v2")
    .select("provider_transfer_amount_cents")
    .eq("id", refund.resolution_id)
    .single();
  if (resolutionError) throw resolutionError;

  const expectedConnectRevision = Number(resolution.provider_transfer_amount_cents) > 0
    ? (await refreshConnectForRelease(refund.payment_id)).connect_revision
    : null;
  const finalizationKey = `refund-v2-event:${eventId}:finalize`;
  const { data, error } = await admin.rpc("finalize_financial_resolution_v2", {
    p_resolution_id: refund.resolution_id,
    p_expected_connect_revision: expectedConnectRevision,
    p_deduplication_key: finalizationKey,
  });
  if (error) throw error;
  let finalization = data?.[0];
  let transfer;
  if (
    finalization?.provider_transfer_id &&
    ["reserved", "submitted", "failed_retryable"].includes(
      finalization.provider_transfer_status,
    )
  ) {
    transfer = await dispatchProviderTransferV2(
      refund.payment_id,
      finalization.provider_transfer_id,
    );
    const { data: completed, error: completionError } = await admin.rpc(
      "finalize_financial_resolution_v2",
      {
        p_resolution_id: refund.resolution_id,
        p_expected_connect_revision: expectedConnectRevision,
        p_deduplication_key: `${finalizationKey}:completed`,
      },
    );
    if (completionError) throw completionError;
    finalization = completed?.[0] ?? finalization;
  }
  return { finalization, transfer };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature || !webhookSecret) return response({ error: "Webhook is not configured" }, 500);

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (error) {
    console.error("Invalid Stripe signature", error);
    return response({ error: "Invalid signature" }, 400);
  }

  const supported = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
    "charge.dispute.created",
    "charge.dispute.updated",
    "charge.dispute.closed",
    "refund.created",
    "refund.updated",
    "refund.failed",
  ];
  if (!supported.includes(event.type)) {
    return response({ skipped: true });
  }

  try {
    if (event.type.startsWith("charge.dispute.")) {
      const incoming = event.data.object as Stripe.Dispute;
      const dispute = await stripe.disputes.retrieve(incoming.id, {
        expand: ["balance_transactions"],
      });
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
      const balanceTransactions = dispute.balance_transactions ?? [];
      const disputeFee = balanceTransactions.reduce((total, value) => {
        const transaction = typeof value === "string" ? null : value;
        return total + Math.max(0, transaction?.fee ?? 0);
      }, 0);
      const { data, error } = await admin.rpc("process_payment_dispute_v2_event", {
        p_event_id: event.id,
        p_event_type: event.type,
        p_stripe_created_at: new Date(event.created * 1000).toISOString(),
        p_stripe_dispute_id: dispute.id,
        p_stripe_charge_id: chargeId,
        p_stripe_status: dispute.status,
        p_reason_code: dispute.reason,
        p_amount_debited_cents: dispute.amount,
        p_stripe_dispute_fee_amount_cents: disputeFee,
        p_currency: dispute.currency,
        p_risk_details: {
          evidence_details: dispute.evidence_details,
          payment_method_details: dispute.payment_method_details,
        },
        p_payload_summary: {
          status: dispute.status,
          reason: dispute.reason,
          is_charge_refundable: dispute.is_charge_refundable,
        },
      });
      if (error) throw error;
      const result = data?.[0];
      if (result?.reversal_id && result.outcome === "opened") {
        await dispatchTransferReversalV2(result.reversal_id);
      }
      if (result?.retransfer_reversal_id && result?.payment_dispute_id) {
        const { data: localDispute, error: disputeError } = await admin
          .from("payment_disputes_v2")
          .select("payment_id")
          .eq("id", result.payment_dispute_id)
          .single();
        if (disputeError) throw disputeError;
        await dispatchProviderRetransferV2(
          localDispute.payment_id,
          result.retransfer_reversal_id
        );
      }
      return response({ ok: true, duplicate: result?.duplicate ?? false, outcome: result?.outcome });
    }

    if (event.type.startsWith("refund.")) {
      const refund = event.data.object as Stripe.Refund;
      const localRefundId = refund.metadata?.refund_v2_id ?? null;
      const { data, error } = await admin.rpc("process_refund_v2_event", {
        p_event_id: event.id,
        p_event_type: event.type,
        p_stripe_created_at: new Date(event.created * 1000).toISOString(),
        p_local_refund_id: localRefundId,
        p_stripe_refund_id: refund.id,
        p_refund_status: refund.status ?? "pending",
        p_amount_cents: refund.amount,
        p_failure_reason: refund.failure_reason ?? null,
        p_payload_summary: {
          status: refund.status,
          reason: refund.reason,
          payment_intent: typeof refund.payment_intent === "string"
            ? refund.payment_intent
            : refund.payment_intent?.id,
        },
      });
      if (error) throw error;
      const result = data?.[0];
      const resolution = result?.refund_id && result.outcome === "succeeded"
        ? await finalizeRefundResolution(result.refund_id, event.id)
        : null;
      return response({
        ok: true,
        duplicate: result?.duplicate ?? false,
        outcome: result?.outcome,
        resolution,
      });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.financial_flow_version === "marketplace_v2") {
      const authoritative = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["payment_intent.latest_charge"],
      });
      const paymentIntent =
        typeof authoritative.payment_intent === "string"
          ? null
          : authoritative.payment_intent;
      const paymentIntentId =
        typeof authoritative.payment_intent === "string"
          ? authoritative.payment_intent
          : authoritative.payment_intent?.id ?? null;
      const latestCharge = paymentIntent?.latest_charge;
      const chargeId = typeof latestCharge === "string" ? latestCharge : latestCharge?.id ?? null;
      const amountTotal = authoritative.amount_total;
      const currency = authoritative.currency;
      if (!Number.isSafeInteger(amountTotal) || !currency) {
        return response({ error: "Invalid Checkout v2 amount" }, 422);
      }
      const { data, error } = await admin.rpc("process_checkout_v2_event", {
        p_event_id: event.id,
        p_event_type: event.type,
        p_stripe_created_at: new Date(event.created * 1000).toISOString(),
        p_livemode: event.livemode,
        p_stripe_session_id: authoritative.id,
        p_payment_status: authoritative.payment_status,
        p_stripe_payment_intent_id: paymentIntentId,
        p_stripe_charge_id: chargeId,
        p_amount_total_cents: amountTotal,
        p_currency: currency,
        p_payload_summary: {
          checkout_status: authoritative.status,
          payment_status: authoritative.payment_status,
          payment_method_types: authoritative.payment_method_types,
        },
      });
      if (error) throw error;
      return response({
        ok: true,
        duplicate: data?.[0]?.duplicate ?? false,
        outcome: data?.[0]?.outcome,
      });
    }

    if (event.type !== "checkout.session.completed") return response({ skipped: true });
    if (session.payment_status !== "paid") return response({ skipped: true });

    const missionId = session.metadata?.mission_id;
    const clientId = session.metadata?.client_id;
    const proId = session.metadata?.pro_id;
    if (!missionId || !clientId || !proId)
      return response({ error: "Missing payment metadata" }, 422);

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntentId) return response({ error: "Missing payment intent" }, 422);
    if (!Number.isSafeInteger(session.amount_total) || !session.currency) {
      return response({ error: "Invalid Stripe amount" }, 422);
    }
    const feeCents = Number(session.metadata?.fee_cents);
    if (!Number.isSafeInteger(feeCents) || feeCents < 0) {
      return response({ error: "Invalid Stripe fee" }, 422);
    }

    const { data, error } = await admin.rpc("process_stripe_checkout_completed", {
      p_event_id: event.id,
      p_event_type: event.type,
      p_stripe_created_at: new Date(event.created * 1000).toISOString(),
      p_livemode: event.livemode,
      p_mission_id: missionId,
      p_client_id: clientId,
      p_pro_id: proId,
      p_stripe_payment_id: paymentIntentId,
      p_stripe_session_id: session.id,
      p_amount_total_cents: session.amount_total,
      p_application_fee_cents: feeCents,
      p_currency: session.currency,
    });
    if (error) throw error;

    return response({ ok: true, duplicate: data?.[0]?.duplicate ?? false });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return response({ error: "Webhook processing failed" }, 500);
  }
});
