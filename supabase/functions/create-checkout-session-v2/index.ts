import Stripe from "npm:stripe@22.5.0";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  maxNetworkRetries: 2,
});
const appUrl = (Deno.env.get("APP_URL") ?? "https://glossed.vercel.app").replace(/\/$/, "");

type Reservation = {
  attempt_id: string;
  attempt_status: "reserved" | "open";
  idempotency_key: string;
  stripe_session_id: string | null;
  stripe_session_url: string | null;
  expires_at: string;
  payment_method_configuration_reference: string;
  currency: string;
  amount_total_cents: number;
  request_id: string;
  proposal_id: string;
  provider_id: string;
  terms_snapshot_id: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json();
    const selectionId = body?.selection_id;
    if (typeof selectionId !== "string") {
      throw new HttpError(400, "Missing selection_id");
    }

    const { data, error } = await admin.rpc("reserve_checkout_v2_attempt", {
      p_selection_id: selectionId,
      p_client_id: user.id,
    });
    if (error) throw error;
    const reservation = data?.[0] as Reservation | undefined;
    if (!reservation) throw new Error("Checkout v2 reservation failed");
    if (reservation.attempt_status === "open" && reservation.stripe_session_url) {
      return json(req, {
        url: reservation.stripe_session_url,
        session_id: reservation.stripe_session_id,
        reused: true,
      });
    }

    const metadata = {
      financial_flow_version: "marketplace_v2",
      checkout_v2_attempt_id: reservation.attempt_id,
      selection_id: selectionId,
      request_id: reservation.request_id,
      proposal_id: reservation.proposal_id,
      client_id: user.id,
      provider_id: reservation.provider_id,
      terms_snapshot_id: reservation.terms_snapshot_id,
    };

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: user.id,
        payment_method_configuration:
          reservation.payment_method_configuration_reference,
        expires_at: Math.floor(new Date(reservation.expires_at).getTime() / 1000),
        line_items: [
          {
            price_data: {
              currency: reservation.currency,
              unit_amount: reservation.amount_total_cents,
              product_data: { name: "Prestation Glossed" },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          metadata,
          transfer_group: `glossed_selection_${selectionId}`,
        },
        metadata,
        success_url: `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/dashboard/reservations`,
      },
      { idempotencyKey: reservation.idempotency_key }
    );

    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    const { error: attachError } = await admin.rpc("attach_checkout_v2_session", {
      p_attempt_id: reservation.attempt_id,
      p_stripe_session_id: session.id,
      p_stripe_session_url: session.url,
      p_stripe_expires_at: new Date(session.expires_at * 1000).toISOString(),
    });
    if (attachError) throw attachError;

    return json(req, { url: session.url, session_id: session.id, reused: false });
  } catch (error) {
    return errorResponse(req, error);
  }
});
