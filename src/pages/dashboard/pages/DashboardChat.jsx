import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatHeader from "@/components/chat/ChatHeader";
import ChatRoom from "@/components/chat/ChatRoom";
import { useUser } from "@/context/UserContext";
import { getMyChat } from "@/lib/chat";

export default function DashboardChat() {
  const { chat_id: chatId } = useParams();
  const { user } = useUser();
  const navigate = useNavigate();
  const [chatInfo, setChatInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchChatInfo = useCallback(async () => {
    setLoading(true);
    try {
      setChatInfo(await getMyChat(chatId));
      setError(null);
    } catch (fetchError) {
      console.error("Unable to load chat:", fetchError);
      setChatInfo(null);
      setError("Unable to load this conversation. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    if (chatId) fetchChatInfo();
  }, [chatId, fetchChatInfo]);

  if (loading) return <p className="p-6 text-gray-500">Loading chat...</p>;

  if (error || !chatInfo) {
    return (
      <div className="w-full min-w-0 p-6 text-center">
        <p className="text-gray-600">{error || "Chat not found."}</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-4 rounded-full bg-rose-600 px-4 py-2 text-white"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden">
      <ChatHeader
        onBack={() => navigate("/dashboard/messages")}
        partner={chatInfo.partner}
        service={chatInfo.missions?.service}
      />
      <ChatRoom chatId={chatId} user={user} />
    </div>
  );
}
