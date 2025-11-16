import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  let event;
  try {
    const body = await req.text();
    event = JSON.parse(body);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
    });
  }

  const type = event.type;
  const data = event.data.object;

  const metadata = data.metadata || data.session?.metadata || data.payment_intent?.metadata || {};

  const missionId = metadata.mission_id;
  const clientId = metadata.client_id;
  const proId = metadata.pro_id;
  const fee = Number(metadata.fee || "0");

  try {
    switch (type) {
      case "payment_intent.succeeded":
      case "checkout.session.completed": {
        if (!missionId) {
          console.warn("No mission_id provided in metadata");
          break;
        }

        // ➤ Convert Stripe cents → euros
        const gross = (data.amount_total ?? data.amount ?? 0) / 100;
        const appFee = fee / 100;
        const net = gross - appFee;

        // 1️⃣ Mission → confirmed
        await supabase
          .from("missions")
          .update({
            status: "confirmed",
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", missionId);

        // 2️⃣ Enregistrer paiement
        await supabase.from("payments").insert({
          mission_id: missionId,
          client_id: clientId,
          pro_id: proId,
          amount: net,
          gross_amount: gross,
          application_fee: appFee,
          currency: data.currency ?? "eur",
          stripe_payment_id: data.payment_intent ?? data.id,
          stripe_session_id: data.id,
          status: "paid",
        });

        break;
      }

      case "payment_intent.payment_failed":
        console.warn("❌ Payment failed:", data.id);
        break;

      default:
        console.log("ℹ️ Event ignored:", type);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
