import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing Stripe signature", {
      status: 400,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, sig, Deno.env.get("STRIPE_WEBHOOK_SECRET")!);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;

        const missionId = session.metadata?.mission_id;
        const proId = session.metadata?.pro_id;
        const clientId = session.metadata?.client_id;
        const stripeSessionId = session.id;

        if (!missionId || !proId || !clientId) {
          throw new Error("Missing metadata fields");
        }

        // 🔹 Mettre à jour le paiement
        await supabase
          .from("payments")
          .update({ status: "paid" })
          .eq("stripe_session_id", stripeSessionId);

        // 🔹 Mettre à jour la mission
        await supabase.from("missions").update({ status: "confirmed" }).eq("id", missionId);

        // 🔹 Mettre à jour le booking lié (si existe)
        await supabase
          .from("bookings")
          .update({ status: "confirmed", pro_id: proId })
          .eq("id", missionId);

        // 🗨️ Créer automatiquement un chat si pas déjà existant
        const { data: existingChat } = await supabase
          .from("chats")
          .select("id")
          .eq("mission_id", missionId)
          .maybeSingle();

        if (!existingChat) {
          const { error: chatError } = await supabase.from("chats").insert([
            {
              mission_id: missionId,
              pro_id: proId,
              client_id: clientId,
              last_message: "Payment confirmed — chat opened!",
              created_at: new Date().toISOString(),
            },
          ]);

          if (chatError) console.error("⚠️ Chat creation error:", chatError.message);
          else console.log("✅ Chat created for mission", missionId);
        }

        console.log("✅ Payment confirmed for mission", missionId);
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as any;
        await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("stripe_session_id", session.id);
        console.log("❌ Session expired", session.id);
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("⚠️ Webhook error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
