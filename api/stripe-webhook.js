// /api/stripe-webhook.js
// ✅ Proxy entre Stripe et Supabase — version stable finale
// Transmet les webhooks Stripe vers Supabase Functions en conservant le corps brut

export const config = {
  api: {
    bodyParser: false, // ⛔️ Nécessaire pour garder la signature Stripe valide
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 🔗 URL de ta fonction Supabase
    const SUPABASE_FUNCTION_URL = process.env.SUPABASE_STRIPE_WEBHOOK_URL;

    if (!SUPABASE_FUNCTION_URL) {
      console.error("Missing SUPABASE_STRIPE_WEBHOOK_URL");
      return res.status(500).json({ error: "Webhook proxy is not configured" });
    }

    // 🧱 Lecture du corps brut (tel que Stripe l’a envoyé)
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks);

    // 📦 Transmission à Supabase sans altération
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": req.headers["content-type"] || "application/json",

        // Stripe signature pour vérification côté Supabase
        "Stripe-Signature": req.headers["stripe-signature"] || "",
      },
      body: rawBody, // 🔒 Pas de transformation
    });

    const responseText = await response.text();
    res.status(response.status).send(responseText);
  } catch (err) {
    console.error("❌ Proxy error:", err);
    res.status(500).json({
      error: "Internal Server Error",
    });
  }
}
