import { MessageSquare } from "lucide-react";

export default function ChatIndexPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
      <MessageSquare className="h-12 w-12" />
      <h2 className="text-xl font-medium">Select a conversation</h2>
      <p className="text-sm">Choose a chat from the sidebar or start a new one</p>
    </div>
  );
}
