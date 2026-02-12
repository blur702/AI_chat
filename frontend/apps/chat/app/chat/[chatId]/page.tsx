"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";
import { TokenUsageBar } from "@/components/chat/token-usage-bar";
import { useConversation } from "@workstation/api";

export default function ChatPage() {
  const params = useParams();
  const rawChatId = params.chatId;
  const chatId = Array.isArray(rawChatId) ? rawChatId[0] : rawChatId ?? "";
  const { messages, loading, processing, progress, tokenUsage, sendMessage, cancelStream } = useConversation(chatId);

  // Global Escape key listener to stop streaming even when textarea isn't focused
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && processing) {
        cancelStream();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [processing, cancelStream]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-medium">Chat {chatId}</h1>
      </div>
      <MessageThread messages={messages} loading={loading} processing={processing} progress={progress} />
      <TokenUsageBar tokenUsage={tokenUsage} />
      <MessageInput onSend={sendMessage} processing={processing} onStop={cancelStream} />
    </div>
  );
}
