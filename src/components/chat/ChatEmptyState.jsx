// 📄 src/components/chat/ChatEmptyState.jsx
export default function ChatEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center text-gray-500">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <span className="text-3xl">💬</span>
      </div>
      <p className="text-lg font-medium">No messages yet</p>
      <p className="text-sm text-gray-400 max-w-xs mt-2">
        Conversations will appear here once you confirm or accept a booking.
      </p>
    </div>
  );
}
