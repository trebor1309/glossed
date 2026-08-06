const functionUrl = process.env.SUPABASE_CREATE_STRIPE_ACCOUNT_URL;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!functionUrl || !accessToken) {
  throw new Error(
    "Set SUPABASE_CREATE_STRIPE_ACCOUNT_URL and SUPABASE_ACCESS_TOKEN before running this script."
  );
}

const res = await fetch(
  functionUrl,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      user_id: "test_user",
      email: "pro@test.com",
    }),
  }
);

const data = await res.json();
console.log(data);
