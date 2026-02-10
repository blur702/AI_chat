export interface TerminalMessage {
  type: "command" | "output" | "exit" | "error" | "connected";
  data: {
    command?: string;
    stream?: "stdout" | "stderr";
    content?: string;
    code?: number;
    message?: string;
    container_id?: string;
  };
  timestamp?: string;
}
