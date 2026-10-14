import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { usePlatformCapabilities } from "@/context/PlatformCapabilitiesContext";

export default function BookingsPausedNotice({ compact = false }) {
  const { bookingsMessage } = usePlatformCapabilities();

  if (compact) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {bookingsMessage}
      </p>
    );
  }

  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <CalendarClock size={28} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-gray-900">Bookings are opening soon</h1>
      <p className="mt-3 text-gray-600">{bookingsMessage}</p>
      <Link
        to="/dashboard/discover"
        className="mt-6 inline-flex rounded-full bg-rose-600 px-5 py-2.5 font-semibold text-white transition hover:bg-rose-700"
      >
        Explore professionals
      </Link>
    </section>
  );
}
