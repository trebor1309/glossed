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
    const SUPABASE_FUNCTION_URL =
      "https://cdcnylgokphyltkctymi.functions.supabase.co/stripe-payment-webhook";

    // 🔑 Utilisation de la clé SERVICE_ROLE côté serveur (plus de 401)
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_ANON_KEY) {
      console.error("❌ Missing Supabase keys in environment variables");
      return res.status(500).json({ error: "Missing Supabase keys" });
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

        // ✅ Utilise Service Role (prioritaire) sinon Anon
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY}`,

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
      details: err.message,
    });
  }
}
