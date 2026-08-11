import { MessageCircle } from "lucide-react";

export default function ChatEmptyState() {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center px-4 py-20 text-center text-gray-500">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <MessageCircle className="h-8 w-8" aria-hidden="true" />
      </div>
      <p className="text-lg font-medium">No messages yet</p>
      <p className="mt-2 max-w-xs text-sm text-gray-400">
        Conversations will appear here once you confirm or accept a booking.
      </p>
    </div>
  );
}
