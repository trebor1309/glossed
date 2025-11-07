export default function StripeSuccess() {
  return (
    <div className="p-10 text-center">
      <h1 className="text-2xl font-semibold text-green-600">Stripe Connected ✅</h1>
      <p className="mt-2 text-gray-600">
        Your Stripe account has been successfully connected. You can now receive payouts.
      </p>
    </div>
  );
}
