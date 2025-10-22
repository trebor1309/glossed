import { useParams } from "react-router-dom";
import ChatRoom from "@/components/chat/ChatRoom";
import { useUser } from "@/context/UserContext";

export default function ChatPage() {
  const { mission_id } = useParams();
  const { session } = useUser();

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">
        💬 Conversation liée à la mission
      </h2>
      <ChatRoom chatId={mission_id} user={session.user} />
    </div>
  );
}
