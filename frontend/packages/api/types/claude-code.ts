export interface ClaudeCodeMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  page_url?: string | null;
  console_logs?: string | null;
  created_at?: string | null;
}

export interface ClaudeCodeMessageList {
  messages: ClaudeCodeMessage[];
  count: number;
}

export interface ClaudeCodeMessageCreate {
  content: string;
  role?: "user" | "assistant";
  page_url?: string | null;
  console_logs?: string | null;
}
