// /api/stripe-webhook.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 🔑 URL de ton Edge Function Supabase
    const SUPABASE_FUNCTION_URL =
      "https://cdcnylgokphyltkctymi.functions.supabase.co/stripe-payment-webhook-v2";

    // 🔐 Utilise la variable Vite que tu as déjà sur Vercel
    const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

    // 📦 Transfère le corps reçu tel quel à Supabase
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    console.error("❌ Proxy error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
}
