import { supabase } from "@/lib/supabaseClient";

function normalizeChatSummary(row) {
  const lastMessage = row.last_message_id
    ? {
        id: row.last_message_id,
        content: row.last_message_content,
        attachment_url: row.last_message_attachment_url,
        created_at: row.last_message_created_at,
        read_at: row.last_message_read_at,
        sender_id: row.last_message_sender_id,
      }
    : null;

  return {
    id: row.id,
    mission_id: row.mission_id,
    pro_id: row.pro_id,
    client_id: row.client_id,
    updated_at: row.updated_at,
    missions: row.service ? { service: row.service } : null,
    partner: row.partner_id
      ? {
          id: row.partner_id,
          username: row.partner_username,
          first_name: row.partner_first_name,
          last_name: row.partner_last_name,
          business_name: row.partner_business_name,
          profile_photo: row.partner_profile_photo,
        }
      : null,
    last_message_obj: lastMessage,
    unread_count: Number(row.unread_count || 0),
  };
}

export async function getMyChatSummaries(chatId = null) {
  const { data, error } = await supabase.rpc("get_my_chat_summaries", {
    p_chat_id: chatId,
  });

  if (error) throw error;
  return (data || []).map(normalizeChatSummary);
}

export async function getMyChat(chatId) {
  const chats = await getMyChatSummaries(chatId);
  return chats[0] || null;
}

export async function getOrCreateChat({ missionId = null, proId = null } = {}) {
  const { data, error } = await supabase.rpc("get_or_create_chat", {
    p_mission_id: missionId,
    p_pro_id: proId,
  });

  if (error) throw error;
  if (!data) throw new Error("Unable to open this conversation.");
  return data;
}
