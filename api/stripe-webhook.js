export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const SUPABASE_FUNCTION_URL =
      "https://cdcnylgokphyltkctymi.functions.supabase.co/stripe-payment-webhook-v2";

    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
