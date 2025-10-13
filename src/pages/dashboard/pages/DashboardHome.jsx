export default function DashboardHome() {
  return (
    <div className="text-center mt-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-3">Welcome back 👋</h1>
      <p className="text-gray-600">
        Here’s a quick overview of your recent activity and upcoming bookings.
      </p>

      <div className="grid md:grid-cols-3 gap-6 mt-10">
        <div className="p-6 bg-white rounded-2xl shadow hover:shadow-md transition">
          <h3 className="text-lg font-semibold mb-2 text-rose-600">Upcoming</h3>
          <p className="text-gray-500">No bookings scheduled.</p>
        </div>
        <div className="p-6 bg-white rounded-2xl shadow hover:shadow-md transition">
          <h3 className="text-lg font-semibold mb-2 text-rose-600">Favorites</h3>
          <p className="text-gray-500">Save your favorite pros for faster booking.</p>
        </div>
        <div className="p-6 bg-white rounded-2xl shadow hover:shadow-md transition">
          <h3 className="text-lg font-semibold mb-2 text-rose-600">Rewards</h3>
          <p className="text-gray-500">Join the Glossed Rewards program soon!</p>
        </div>
      </div>
    </div>
  );
}
