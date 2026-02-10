import type {
  LoginRequest,
  LoginResponse,
  UserCreateRequest,
  UserCreateResponse,
  UserResponse,
  UserUpdateRequest,
  PasswordChangeRequest,
  PasswordChangeResponse,
  VRAMStats,
  Resource,
  ResourceStatusResponse,
  PreemptionCheckRequest,
  PreemptionCheckResponse,
  OffloadDecisionRequest,
  OffloadDecisionResponse,
  ReloadRequest,
  PreferenceRequest,
  PreferenceResponse,
  OperationStateRequest,
  OperationStateResponse,
  OperationListResponse,
  EventCreate,
  EventResponse,
  EventListResponse,
  ToolInfo,
  ToolListResponse,
  ToolExecuteRequest,
  ToolExecuteResponse,
  CacheClearRequest,
  CacheClearResponse,
  ConversationState,
  ProjectContext,
  ChatListResponse,
  ChatCreateResponse,
  ChatUpdateRequest,
  ChatUpdateResponse,
  ProjectCreateRequest,
  ProjectCreateResponse,
  ProjectListResponse,
  ProjectUpdateRequest,
  ProjectUpdateResponse,
  UserPreferences,
  UserPreferencesUpdateRequest,
  TokenUsageRequest,
  TokenUsageResponse,
  KernelDebug,
  KernelMetrics,
  StreamEvent,
  SandboxChatResponse,
  FileNode,
  FileTreeResponse,
  FileContent,
  AutomationAction,
  AutomationActionListResponse,
  AutomationActionExecuteResponse,
  YoloEdit,
  YoloEditListResponse,
  YoloEditUndoResponse,
  ModelListResponse,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "ApiError";
  }
}

export class WorkstationClient {
  private baseUrl: string;
  private token: string | null = null;
  private maxRetries: number;
  private retryBaseDelayMs: number;

  constructor(baseUrl?: string, maxRetries = 2, retryBaseDelayMs = 500) {
    this.baseUrl = baseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "";
    this.maxRetries = maxRetries;
    this.retryBaseDelayMs = retryBaseDelayMs;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const fetchOpts: RequestInit = { ...options, headers };
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, fetchOpts);

        if (!response.ok) {
          const body = await response.text().catch(() => undefined);
          const err = new ApiError(response.status, response.statusText, body);
          // Only retry on server errors (5xx), not client errors (4xx)
          if (response.status >= 500 && attempt < this.maxRetries) {
            lastError = err;
            await this.delay(attempt);
            continue;
          }
          throw err;
        }

        if (response.status === 204) {
          return undefined as T;
        }

        return response.json();
      } catch (err) {
        // Don't retry ApiError (4xx) — already thrown above
        if (err instanceof ApiError && err.status < 500) throw err;

        lastError = err;
        if (attempt < this.maxRetries) {
          await this.delay(attempt);
          continue;
        }
      }
    }

    throw lastError;
  }

  private delay(attempt: number): Promise<void> {
    const ms = this.retryBaseDelayMs * Math.pow(2, attempt);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Health
  async health(): Promise<Record<string, unknown>> {
    return this.request("/health");
  }

  async kernelHealth(): Promise<Record<string, unknown>> {
    return this.request("/api/kernel/health");
  }

  async kernelStatus(): Promise<Record<string, unknown>> {
    return this.request("/api/kernel/status");
  }

  // Auth
  async login(identifier: string, password: string): Promise<LoginResponse> {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password } satisfies LoginRequest),
    });
  }

  async createUser(data: UserCreateRequest): Promise<UserCreateResponse> {
    return this.request("/api/auth/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getCurrentUser(): Promise<UserResponse> {
    return this.request("/api/auth/me");
  }

  async updateUser(userId: string, data: UserUpdateRequest): Promise<UserResponse> {
    return this.request(`/api/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<PasswordChangeResponse> {
    return this.request("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      } satisfies PasswordChangeRequest),
    });
  }

  // Resources
  async getVRAMStats(): Promise<VRAMStats> {
    return this.request("/api/resources/vram");
  }

  async getResources(): Promise<Resource[]> {
    return this.request("/api/resources/loaded");
  }

  async getResourceStatus(): Promise<ResourceStatusResponse> {
    return this.request("/api/resources/status");
  }

  async checkPreemption(
    data: PreemptionCheckRequest
  ): Promise<PreemptionCheckResponse> {
    return this.request("/api/resources/preemption-check", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async submitOffloadDecision(
    data: OffloadDecisionRequest
  ): Promise<OffloadDecisionResponse> {
    return this.request("/api/resources/offload-decision", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async reloadResource(
    data: ReloadRequest
  ): Promise<OffloadDecisionResponse> {
    return this.request("/api/resources/reload", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async setPreference(data: PreferenceRequest): Promise<PreferenceResponse> {
    return this.request("/api/resources/preferences", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getPreference(userId: string): Promise<PreferenceResponse> {
    return this.request(`/api/resources/preferences/${userId}`);
  }

  // Operations
  async saveOperationState(
    data: OperationStateRequest
  ): Promise<OperationStateResponse> {
    return this.request("/api/operations/state", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getOperationState(
    operationId: string
  ): Promise<OperationStateResponse> {
    return this.request(`/api/operations/state/${operationId}`);
  }

  async listOperations(
    limit?: number,
    offset?: number
  ): Promise<OperationListResponse> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (offset !== undefined) params.set("offset", String(offset));
    return this.request(`/api/operations?${params}`);
  }

  // Events
  async createEvent(data: EventCreate): Promise<EventResponse> {
    return this.request("/api/events", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getEvents(params?: {
    event_type?: string;
    severity?: string;
    source?: string;
    limit?: number;
    offset?: number;
  }): Promise<EventListResponse> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.set(key, String(value));
      });
    }
    return this.request(`/api/events?${searchParams}`);
  }

  async getEvent(eventId: string): Promise<EventResponse> {
    return this.request(`/api/events/${eventId}`);
  }

  // Tools
  async listTools(): Promise<ToolListResponse> {
    return this.request("/api/tools");
  }

  async getTool(toolName: string): Promise<ToolInfo> {
    return this.request(`/api/tools/${toolName}`);
  }

  async executeTool(data: ToolExecuteRequest): Promise<ToolExecuteResponse> {
    return this.request("/api/tools/execute", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async clearCache(data: CacheClearRequest): Promise<CacheClearResponse> {
    return this.request("/api/tools/cache/clear", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Context
  async getConversationState(chatId: string): Promise<ConversationState> {
    return this.request(`/api/context/conversations/${chatId}`);
  }

  async updateConversationState(
    chatId: string,
    updates: Record<string, unknown>
  ): Promise<ConversationState> {
    return this.request(`/api/context/conversations/${chatId}`, {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    });
  }

  async getProjectContext(projectId: string): Promise<ProjectContext> {
    return this.request(`/api/context/projects/${projectId}`);
  }

  async getProjectChats(projectId: string): Promise<ChatListResponse> {
    return this.request(`/api/context/project/${projectId}/chats`);
  }

  async createChat(projectId: string, title: string): Promise<ChatCreateResponse> {
    return this.request("/api/context/chats", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, title }),
    });
  }

  async updateChat(chatId: string, updates: ChatUpdateRequest): Promise<ChatUpdateResponse> {
    return this.request(`/api/context/chats/${chatId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteChat(chatId: string): Promise<void> {
    return this.request(`/api/context/chats/${chatId}`, {
      method: "DELETE",
    });
  }

  async getOrCreateProjectChat(projectId: string): Promise<SandboxChatResponse> {
    return this.request(`/api/context/project/${projectId}/default-chat`, {
      method: "POST",
    });
  }

  // Projects
  async listProjects(): Promise<ProjectListResponse> {
    return this.request("/api/projects");
  }

  async createProject(data: ProjectCreateRequest): Promise<ProjectCreateResponse> {
    return this.request("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProject(projectId: string, data: ProjectUpdateRequest): Promise<ProjectUpdateResponse> {
    return this.request(`/api/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    return this.request(`/api/projects/${projectId}`, {
      method: "DELETE",
    });
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    return this.request(`/api/context/user/${userId}/preferences`);
  }

  async updateUserPreferences(userId: string, data: UserPreferencesUpdateRequest): Promise<UserPreferences> {
    return this.request(`/api/context/user/${userId}/preferences`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async listModels(): Promise<ModelListResponse> {
    return this.request("/api/context/models");
  }

  async trackTokenUsage(
    chatId: string,
    data: TokenUsageRequest
  ): Promise<TokenUsageResponse> {
    return this.request(`/api/context/conversations/${chatId}/tokens`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Streaming
  streamMessage(
    chatId: string,
    content: string,
    onToken: (token: string) => void,
    onDone: (data: { message_id: string; model: string; created_at?: string }) => void,
    onError: (error: string) => void,
    model?: string
  ): () => void {
    const url = `${this.baseUrl}/api/context/conversations/${chatId}/messages/stream`;

    const controller = new AbortController();

    (async () => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (this.token) {
          headers["Authorization"] = `Bearer ${this.token}`;
        }
        const body: Record<string, string> = { content };
        if (model) body.model = model;
        const response = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers,
          body: JSON.stringify(body),
        });
        if (!response.ok || !response.body) {
          onError(`HTTP ${response.status}: ${response.statusText}`);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            try {
              const event: StreamEvent = JSON.parse(jsonStr);
              if (event.type === "token") {
                onToken(event.content);
              } else if (event.type === "done") {
                onDone({
                  message_id: event.message_id,
                  model: event.model,
                  created_at: event.created_at,
                });
              } else if (event.type === "error") {
                onError(event.message);
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        onError(err instanceof Error ? err.message : "Stream connection failed");
      }
    })();

    return () => controller.abort();
  }

  // Sandbox file operations
  async getFileTree(projectId: string): Promise<FileTreeResponse> {
    return this.request(`/api/sandbox/${projectId}/files`);
  }

  async getFileContent(projectId: string, path: string): Promise<FileContent> {
    const params = new URLSearchParams({ path });
    return this.request(`/api/sandbox/${projectId}/files/content?${params}`);
  }

  async createFile(
    projectId: string,
    path: string,
    content?: string
  ): Promise<FileNode> {
    return this.request(`/api/sandbox/${projectId}/files`, {
      method: "POST",
      body: JSON.stringify({ path, content: content ?? "" }),
    });
  }

  async createDirectory(
    projectId: string,
    path: string
  ): Promise<FileNode> {
    return this.request(`/api/sandbox/${projectId}/directories`, {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  }

  async updateFile(
    projectId: string,
    path: string,
    content: string
  ): Promise<FileNode> {
    return this.request(`/api/sandbox/${projectId}/files`, {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    });
  }

  async renameFile(
    projectId: string,
    oldPath: string,
    newPath: string
  ): Promise<FileNode> {
    return this.request(`/api/sandbox/${projectId}/files/rename`, {
      method: "PUT",
      body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
    });
  }

  async deleteFile(projectId: string, path: string): Promise<void> {
    const params = new URLSearchParams({ path });
    return this.request(`/api/sandbox/${projectId}/files?${params}`, {
      method: "DELETE",
    });
  }

  // Automation Actions
  async createAutomationAction(
    projectId: string,
    actionType: string,
    actionData?: Record<string, any>
  ): Promise<AutomationAction> {
    return this.request("/api/automation/actions", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        action_type: actionType,
        action_data: actionData,
      }),
    });
  }

  async listAutomationActions(
    projectId: string,
    filters?: { approved?: boolean; executed?: boolean }
  ): Promise<AutomationActionListResponse> {
    const params = new URLSearchParams();
    if (filters?.approved !== undefined)
      params.set("approved", String(filters.approved));
    if (filters?.executed !== undefined)
      params.set("executed", String(filters.executed));
    return this.request(`/api/automation/actions/${projectId}?${params}`);
  }

  async approveAutomationAction(
    actionId: string,
    modifiedData?: Record<string, any>
  ): Promise<AutomationAction> {
    return this.request(`/api/automation/actions/${actionId}/approve`, {
      method: "PUT",
      body: JSON.stringify(
        modifiedData !== undefined ? { action_data: modifiedData } : {}
      ),
    });
  }

  async executeAutomationAction(
    actionId: string
  ): Promise<AutomationActionExecuteResponse> {
    return this.request(`/api/automation/actions/${actionId}/execute`, {
      method: "POST",
    });
  }

  async deleteAutomationAction(actionId: string): Promise<void> {
    return this.request(`/api/automation/actions/${actionId}`, {
      method: "DELETE",
    });
  }

  // YOLO Edits
  async listYoloEdits(
    projectId: string,
    filters?: { limit?: number; offset?: number; undo_performed?: boolean }
  ): Promise<YoloEditListResponse> {
    const params = new URLSearchParams();
    if (filters?.limit !== undefined) params.set("limit", String(filters.limit));
    if (filters?.offset !== undefined)
      params.set("offset", String(filters.offset));
    if (filters?.undo_performed !== undefined)
      params.set("undo_performed", String(filters.undo_performed));
    return this.request(`/api/yolo/edits/${projectId}?${params}`);
  }

  async getYoloEditDetail(editId: string): Promise<YoloEdit> {
    return this.request(`/api/yolo/edits/${editId}/detail`);
  }

  async undoYoloEdit(editId: string): Promise<YoloEditUndoResponse> {
    return this.request(`/api/yolo/edits/${editId}/undo`, {
      method: "POST",
    });
  }

  // Admin
  async getKernelDebug(): Promise<KernelDebug> {
    return this.request("/api/admin/kernel/debug");
  }

  async getKernelMetrics(): Promise<KernelMetrics> {
    return this.request("/api/admin/kernel/metrics");
  }
}

// Singleton client instance
let clientInstance: WorkstationClient | null = null;

export function getClient(): WorkstationClient {
  if (!clientInstance) {
    clientInstance = new WorkstationClient();
  }
  return clientInstance;
}
