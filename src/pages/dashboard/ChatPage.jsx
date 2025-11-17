// src/pages/dashboard/ChatPage.jsx
import { useParams } from "react-router-dom";
import { useUser } from "@/context/UserContext";

import ChatRoom from "@/components/chat/ChatRoom";
import ChatList from "@/components/chat/ChatList";

export default function ChatPage() {
  const { chatId } = useParams();
  const { user } = useUser();

  // Non connecté → rien
  if (!user) return null;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* MODE LISTE */}
      {!chatId && (
        <div>
          <h2 className="text-2xl font-semibold mb-6 text-gray-800">💬 Messages</h2>
          <ChatList user={user} />
        </div>
      )}

      {/* MODE CHAT ROOM */}
      {chatId && (
        <div>
          <ChatRoom chatId={chatId} user={user} />
        </div>
      )}
    </div>
  );
}
