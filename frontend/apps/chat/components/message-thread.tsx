"use client";

import { useEffect, useRef } from "react";
import { ScrollArea, Skeleton } from "@workstation/ui";
import { MessageBubble } from "./message-bubble";
import { ThinkingIndicator } from "./thinking-indicator";
import { CompactionBanner } from "./chat/compaction-banner";
import type { MessageSummary, CompactionSummary } from "@workstation/api";

const isDev = process.env.NODE_ENV === "development";

// Mock messages for development only
const MOCK_MESSAGES: MessageSummary[] = [
  {
    id: "1",
    role: "user",
    content: "How do I set up a FastAPI project with async SQLAlchemy?",
    is_pinned: false,
    is_excluded: false,
    created_at: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: "2",
    role: "assistant",
    content: `Here's how to set up a FastAPI project with async SQLAlchemy:

\`\`\`python
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

app = FastAPI()

engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost/db",
    echo=True,
)

async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)
\`\`\`

You'll need to install the following dependencies:

\`\`\`bash
pip install fastapi sqlalchemy asyncpg uvicorn
\`\`\`

This gives you a fully async database setup. Let me know if you need help with migrations using Alembic!`,
    is_pinned: false,
    is_excluded: false,
    created_at: new Date(Date.now() - 240000).toISOString(),
  },
  {
    id: "3",
    role: "user",
    content: "That looks great! Can you also show me how to add Alembic migrations?",
    is_pinned: false,
    is_excluded: false,
    created_at: new Date(Date.now() - 120000).toISOString(),
  },
];

interface MessageThreadProps {
  messages: MessageSummary[];
  compactions?: CompactionSummary[];
  loading: boolean;
  processing?: boolean;
  progress?: number;
  onPin?: (messageId: string, pinned: boolean) => void;
  onExclude?: (messageId: string, excluded: boolean) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
}

export function MessageThread({
  messages,
  compactions = [],
  loading,
  processing,
  progress = 0,
  onPin,
  onExclude,
  onEdit,
  onDelete,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const displayMessages =
    messages.length > 0
      ? messages
      : isDev
        ? MOCK_MESSAGES
        : [];

  // Track content length of last message for auto-scroll during streaming
  const lastMsg = displayMessages[displayMessages.length - 1];
  const lastContentLen = lastMsg?.content?.length ?? 0;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }, [messages.length, processing, lastContentLen]);

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4" aria-busy="true" aria-label="Loading messages">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (displayMessages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground" role="status">
        No messages yet. Start a conversation!
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div
        className="space-y-1 py-4"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions"
        role="log"
        aria-label="Message thread"
      >
        {/* Show compaction banners at the top of the thread */}
        {compactions.map((c) => (
          <CompactionBanner key={c.id} compaction={c} />
        ))}

        {displayMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            id={msg.id}
            role={msg.role}
            content={msg.content}
            isPinned={msg.is_pinned}
            isExcluded={msg.is_excluded}
            timestamp={
              msg.created_at
                ? new Date(msg.created_at).toLocaleTimeString()
                : undefined
            }
            onPin={onPin}
            onExclude={onExclude}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
        {processing && <ThinkingIndicator progress={progress} />}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
