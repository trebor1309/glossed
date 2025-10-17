import fetch from "node-fetch";

const res = await fetch(
  "https://cdcnylgokphyltkctymi.functions.supabase.co/create-stripe-account",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkY255bGdva3BoeWx0a2N0eW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NTgyNzAsImV4cCI6MjA3NjAzNDI3MH0.VUSKEifF-53dPAYxA14mkLSmfVK9aGO3IMCgBDQigCQ",
    },
    body: JSON.stringify({
      user_id: "test_user",
      email: "pro@test.com",
    }),
  }
);

const data = await res.json();
console.log(data);
