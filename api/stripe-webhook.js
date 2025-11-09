// /api/stripe-webhook.js
// ✅ Proxy sécurisé entre Stripe et Supabase
// Version JavaScript compatible Vercel + Vite

export const config = {
  api: {
    bodyParser: false, // ⛔️ Empêche Vercel de parser le JSON (Stripe veut le corps brut)
  },
};

export default async function handler(req, res) {
  // Stripe n’envoie que des POST
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

    // 🧱 Lis le corps brut envoyé par Stripe (nécessaire pour conserver la signature)
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks);

    // 📦 Transmets le corps brut à ton Edge Function Supabase
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Stripe-Signature": req.headers["stripe-signature"] || "",
      },
      body: rawBody, // ✅ envoie le corps brut
    });

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    console.error("❌ Proxy error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
}
