// /api/stripe-webhook.js
// ✅ Proxy entre Stripe et Supabase — version finale (signature conservée)

export const config = {
  api: {
    bodyParser: false, // Stripe veut le corps brut pour la vérification
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const SUPABASE_FUNCTION_URL =
      "https://cdcnylgokphyltkctymi.functions.supabase.co/stripe-payment-webhook-v2";

    const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
    if (!SUPABASE_ANON_KEY) {
      console.error("❌ Missing VITE_SUPABASE_ANON_KEY");
      return res.status(500).json({ error: "Missing Supabase anon key" });
    }

    // 🧱 Lis le corps brut tel que Stripe l’envoie
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");

    // 📦 Envoie à Supabase exactement le même corps + mêmes headers
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": req.headers["content-type"] || "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Stripe-Signature": req.headers["stripe-signature"] || "",
      },
      body: rawBody, // ✅ Texte brut
    });

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    console.error("❌ Proxy error:", err);
    res.status(500).json({
      error: "Internal Server Error",
      details: err.message,
    });
  }
}
