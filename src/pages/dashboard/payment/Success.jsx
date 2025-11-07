export default function PaymentSuccess() {
  return (
    <div className="p-10 text-center">
      <h1 className="text-2xl font-semibold text-green-600">Payment Successful ✅</h1>
      <p className="mt-3 text-gray-600">
        Your booking has been confirmed. You’ll find it in your appointments.
      </p>
      <a
        href="/dashboard"
        className="inline-block mt-6 px-6 py-3 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition"
      >
        Back to Dashboard
      </a>
    </div>
  );
}
