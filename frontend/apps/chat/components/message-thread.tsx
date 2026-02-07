"use client";

import { useEffect, useRef } from "react";
import { ScrollArea, Skeleton } from "@workstation/ui";
import { MessageBubble } from "./message-bubble";
import type { MessageSummary } from "@workstation/api";

// Mock messages for development
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
  loading: boolean;
}

export function MessageThread({ messages, loading }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Use mock data when no real messages available
  const displayMessages = messages.length > 0 ? messages : MOCK_MESSAGES;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4">
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

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-1 py-4">
        {displayMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            timestamp={
              msg.created_at
                ? new Date(msg.created_at).toLocaleTimeString()
                : undefined
            }
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
