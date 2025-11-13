// src/components/navigation/NotificationBadge.jsx
export default function NotificationBadge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-2 bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white animate-pulse shadow-sm">
      {count > 9 ? "9+" : count}
    </span>
  );
}
