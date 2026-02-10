"use client";

import { useParams } from "next/navigation";
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";
import { useConversation } from "@workstation/api";

export default function ChatPage() {
  const params = useParams();
  const rawChatId = params.chatId;
  const chatId = Array.isArray(rawChatId) ? rawChatId[0] : rawChatId ?? "";
  const { messages, loading, processing, progress, sendMessage } = useConversation(chatId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-medium">Chat {chatId}</h1>
      </div>
      <MessageThread messages={messages} loading={loading} processing={processing} progress={progress} />
      <MessageInput onSend={sendMessage} />
    </div>
  );
}
