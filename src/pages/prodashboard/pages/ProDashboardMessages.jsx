import { useNavigate } from "react-router-dom";
import ChatEmptyState from "@/components/chat/ChatEmptyState";
import ChatList from "@/components/chat/ChatList";
import { useChatList } from "@/components/chat/hooks/useChatList";
import { useUser } from "@/context/UserContext";

export default function ProDashboardMessages() {
  const { session } = useUser();
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const { chats, unreadMap, loading, error, retry } = useChatList(userId);

  const openChat = (chat) => navigate(`/prodashboard/messages/${chat.id}`);

  return (
    <div className="w-full min-w-0 max-w-full px-3 py-5 sm:px-4 sm:py-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Messages</h1>

      {loading && <p className="text-sm text-gray-500">Loading conversations...</p>}

      {!loading && error && (
        <div
          className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          <p>{error}</p>
          <button type="button" onClick={() => retry()} className="mt-2 font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && chats.length === 0 && <ChatEmptyState />}

      {!loading && !error && chats.length > 0 && (
        <ChatList chats={chats} onOpenChat={openChat} unreadMap={unreadMap} />
      )}
    </div>
  );
}
