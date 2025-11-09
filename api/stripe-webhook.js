// /api/stripe-webhook.js
// ✅ Proxy entre Stripe et Supabase — version finale (envoi Buffer brut)

export const config = {
  api: {
    bodyParser: false, // 🔒 Empêche tout parsing automatique
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

    // 🧱 Lis les données brutes (exactement comme Stripe les a envoyées)
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks);

    // 📦 Transmets exactement le même corps et les mêmes headers à Supabase
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": req.headers["content-type"] || "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Stripe-Signature": req.headers["stripe-signature"] || "",
      },
      // ⛔️ Pas de transformation — on envoie le Buffer brut
      body: rawBody,
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
