/** Shared utility functions for the Context Editor components. */

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function getLayerLabel(name: string): string {
  const labels: Record<string, string> = {
    system_prompt: "System Prompt",
    project_context: "Project Context",
    chat_instructions: "Chat Instructions",
    kb_results: "Knowledge Base",
    conversation: "Conversation",
  };
  if (labels[name]) return labels[name];
  if (name.startsWith("compaction_summary")) return "Compaction Summary";
  return name;
}

export function getLayerColor(name: string): string {
  const colors: Record<string, string> = {
    system_prompt: "bg-blue-500/10 text-blue-600",
    project_context: "bg-purple-500/10 text-purple-600",
    chat_instructions: "bg-cyan-500/10 text-cyan-600",
    kb_results: "bg-amber-500/10 text-amber-600",
    conversation: "bg-green-500/10 text-green-600",
  };
  if (colors[name]) return colors[name];
  if (name.startsWith("compaction_summary")) return "bg-orange-500/10 text-orange-600";
  return "";
}
