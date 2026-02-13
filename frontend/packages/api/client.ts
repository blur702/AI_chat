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
  KernelStatusResponse,
  EventCreate,
  EventResponse,
  EventBroadcastResponse,
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
  SystemPrompt,
  SystemPromptCreateRequest,
  SystemPromptUpdateRequest,
  SystemPromptListResponse,
  MessageUpdateRequest,
  MessageUpdateResponse,
  TokenBreakdownResponse,
  ProjectCreateRequest,
  ProjectCreateResponse,
  ProjectListResponse,
  ProjectUpdateRequest,
  ProjectUpdateResponse,
  UserPreferences,
  UserPreferencesUpdateRequest,
  TokenUsageRequest,
  TokenUsageResponse,
  KernelDebugInfo,
  KernelMetrics,
  ServiceDebugInfo,
  AdminUser,
  AdminUserListResponse,
  AdminUserListParams,
  AdminUserUpdateRequest,
  AdminUserUpdateResponse,
  UserUnlockResponse,
  AuditLogEntry,
  AuditLogListResponse,
  AuditLogFilters,
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
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationListResponse,
  KBChunk,
  KBSourceListResponse,
  KBSource,
  KBSearchRequest,
  KBSearchResponse,
  EventStatsResponse,
  TemplateInfo,
  TemplateListResponse,
  GitImportRequest,
  GitImportResponse,
  ArchiveUploadResponse,
  ImportStatusResponse,
  DetectionResultResponse,
  CloneProjectRequest,
  CloneProjectResponse,
  SnapshotCreateRequest,
  SnapshotInfo,
  SnapshotListResponse,
  SnapshotRestoreResponse,
  DrupalConnectRequest,
  DrupalConnectResponse,
  DrupalSiteInfo,
  DrupalSiteConfig,
  DrushCommandRequest,
  DrushCommandResponse,
  SyncStatus,
  SyncResponse,
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

          // On 401, clear token and redirect to login
          // Skip redirect for the login endpoint itself — let the caller handle it
          if (response.status === 401 && typeof window !== "undefined" && !path.endsWith("/auth/login")) {
            localStorage.removeItem("workstation_token");
            this.token = null;
            window.location.href = "/login";
            throw err;
          }

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

  /**
   * Lower-level fetch that adds auth headers and handles 401 redirect,
   * but does NOT assume JSON request/response. Use for FormData uploads
   * and Blob downloads.
   */
  private async rawFetch(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401 && typeof window !== "undefined" && !path.endsWith("/auth/login")) {
        localStorage.removeItem("workstation_token");
        this.token = null;
        window.location.href = "/login";
      }
      const body = await response.text().catch(() => undefined);
      throw new ApiError(response.status, response.statusText, body);
    }

    return response;
  }

  // Health
  async health(): Promise<Record<string, unknown>> {
    return this.request("/health");
  }

  async kernelHealth(): Promise<Record<string, unknown>> {
    return this.request("/api/kernel/health");
  }

  async kernelStatus(): Promise<KernelStatusResponse> {
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

  async getResourceStatus(): Promise<ResourceStatusResponse> {
    return this.request("/api/resources/status");
  }

  async checkPreemption(
    data: PreemptionCheckRequest
  ): Promise<PreemptionCheckResponse> {
    return this.request("/api/resources/check-preemption", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async submitOffloadDecision(
    data: OffloadDecisionRequest
  ): Promise<OffloadDecisionResponse> {
    return this.request("/api/resources/offload", {
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
    return this.request("/api/resources/preference", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getPreference(userId: string): Promise<PreferenceResponse> {
    return this.request(`/api/resources/preference/${userId}`);
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

  async getEventTypes(): Promise<string[]> {
    return this.request("/api/events/types/list");
  }

  async getEventStats(): Promise<EventStatsResponse> {
    return this.request("/api/events/stats/summary");
  }

  async createEventBroadcast(data: EventCreate): Promise<EventResponse | EventBroadcastResponse> {
    return this.request("/api/events", {
      method: "POST",
      body: JSON.stringify(data),
    });
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

  async getTokenUsage(chatId: string): Promise<TokenUsageResponse> {
    return this.request(`/api/context/conversations/${chatId}/tokens`);
  }

  // System Prompts
  async listSystemPrompts(): Promise<SystemPromptListResponse> {
    return this.request("/api/context/system-prompts");
  }

  async createSystemPrompt(data: SystemPromptCreateRequest): Promise<SystemPrompt> {
    return this.request("/api/context/system-prompts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getSystemPrompt(promptId: string): Promise<SystemPrompt> {
    return this.request(`/api/context/system-prompts/${encodeURIComponent(promptId)}`);
  }

  async updateSystemPrompt(promptId: string, data: SystemPromptUpdateRequest): Promise<SystemPrompt> {
    return this.request(`/api/context/system-prompts/${encodeURIComponent(promptId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteSystemPrompt(promptId: string): Promise<void> {
    return this.request(`/api/context/system-prompts/${encodeURIComponent(promptId)}`, {
      method: "DELETE",
    });
  }

  // Message Actions
  async updateMessage(chatId: string, messageId: string, data: MessageUpdateRequest): Promise<MessageUpdateResponse> {
    return this.request(`/api/context/conversations/${chatId}/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    return this.request(`/api/context/conversations/${chatId}/messages/${messageId}`, {
      method: "DELETE",
    });
  }

  async triggerCompaction(chatId: string): Promise<{ status: string; compaction_id?: string; reason?: string }> {
    return this.request(`/api/context/conversations/${chatId}/compact`, {
      method: "POST",
    });
  }

  async getTokenBreakdown(chatId: string): Promise<TokenBreakdownResponse> {
    return this.request(`/api/context/conversations/${chatId}/token-breakdown`);
  }

  // Streaming
  streamMessage(
    chatId: string,
    content: string,
    onToken: (token: string) => void,
    onDone: (data: {
      message_id: string;
      model: string;
      created_at?: string;
      token_count?: number;
      max_tokens?: number;
      usage_ratio?: number;
    }) => void,
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
          if (response.status === 401 && typeof window !== "undefined") {
            localStorage.removeItem("workstation_token");
            this.token = null;
            window.location.href = "/login";
            return;
          }
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
                  token_count: event.token_count,
                  max_tokens: event.max_tokens,
                  usage_ratio: event.usage_ratio,
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

  // Image Generation
  async generateImage(
    data: ImageGenerationRequest
  ): Promise<ImageGenerationResponse> {
    const payload: ImageGenerationRequest = {
      project_id: data.project_id,
      workflow_type: data.workflow_type,
      prompt: data.prompt,
      negative_prompt: data.negative_prompt,
      width: data.width,
      height: data.height,
      steps: data.steps,
      cfg_scale: data.cfg_scale,
      ...(data.input_image ? { input_image: data.input_image } : {}),
      ...(data.denoise !== undefined ? { denoise: data.denoise } : {}),
    };

    return this.request("/api/image/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getGenerationStatus(jobId: string): Promise<ImageGenerationResponse> {
    return this.request(`/api/image/status/${encodeURIComponent(jobId)}`);
  }

  async getGenerationResult(jobId: string): Promise<ImageGenerationResponse> {
    return this.request(`/api/image/result/${encodeURIComponent(jobId)}`);
  }

  async listGenerations(
    projectId?: string,
    skip?: number,
    limit?: number,
    status?: string
  ): Promise<ImageGenerationListResponse> {
    const params = new URLSearchParams();
    if (projectId) params.set("project_id", projectId);
    if (skip !== undefined) params.set("skip", String(skip));
    if (limit !== undefined) params.set("limit", String(limit));
    if (status) params.set("status", status);

    const query = params.toString();
    return this.request(`/api/image/generations${query ? `?${query}` : ""}`);
  }

  async downloadImage(jobId: string, filename: string): Promise<Blob> {
    const response = await this.rawFetch(
      `/api/image/download/${encodeURIComponent(jobId)}/${encodeURIComponent(filename)}`
    );
    return response.blob();
  }

  async deleteGeneration(jobId: string): Promise<void> {
    return this.request(`/api/image/generations/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    });
  }

  // Templates
  async getTemplates(category?: string): Promise<TemplateListResponse> {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    const query = params.toString();
    return this.request(`/api/templates${query ? `?${query}` : ""}`);
  }

  async getTemplate(templateId: string): Promise<TemplateInfo> {
    return this.request(`/api/templates/${encodeURIComponent(templateId)}`);
  }

  // Project Import / Export / Snapshots
  async importFromGit(data: GitImportRequest): Promise<GitImportResponse> {
    return this.request("/api/projects/import/git", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async importFromArchive(
    name: string,
    file: File,
    installDeps?: boolean,
    path?: string
  ): Promise<ArchiveUploadResponse> {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("file", file);
    if (installDeps !== undefined)
      formData.append("install_deps", String(installDeps));
    if (path) formData.append("path", path);

    const response = await this.rawFetch("/api/projects/import/upload", {
      method: "POST",
      body: formData,
    });
    return response.json();
  }

  async getImportStatus(importId: string): Promise<ImportStatusResponse> {
    return this.request(
      `/api/projects/import/${encodeURIComponent(importId)}/status`
    );
  }

  async detectProjectType(projectId: string): Promise<DetectionResultResponse> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/detect-type`, {
      method: "POST",
    });
  }

  async exportProject(projectId: string): Promise<Blob> {
    const response = await this.rawFetch(
      `/api/projects/${encodeURIComponent(projectId)}/export`,
      { method: "POST" }
    );
    return response.blob();
  }

  async cloneProject(
    projectId: string,
    data: CloneProjectRequest
  ): Promise<CloneProjectResponse> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/clone`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createSnapshot(
    projectId: string,
    data: SnapshotCreateRequest
  ): Promise<SnapshotInfo> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/snapshots`,
      { method: "POST", body: JSON.stringify(data) }
    );
  }

  async listSnapshots(projectId: string): Promise<SnapshotListResponse> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/snapshots`
    );
  }

  async restoreSnapshot(
    projectId: string,
    name: string
  ): Promise<SnapshotRestoreResponse> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(name)}/restore`,
      { method: "POST" }
    );
  }

  async deleteSnapshot(projectId: string, name: string): Promise<void> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
  }

  // Drupal MCP
  async connectDrupalSite(
    projectId: string,
    data: DrupalConnectRequest
  ): Promise<DrupalConnectResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/connect`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getDrupalSite(projectId: string): Promise<DrupalSiteInfo> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/site`);
  }

  async disconnectDrupalSite(projectId: string): Promise<void> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/site`, {
      method: "DELETE",
    });
  }

  async getDrupalConfig(projectId: string): Promise<DrupalSiteConfig> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/config`);
  }

  async runDrush(
    projectId: string,
    command: string
  ): Promise<DrushCommandResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/drush`, {
      method: "POST",
      body: JSON.stringify({ command } satisfies DrushCommandRequest),
    });
  }

  async pullDrupalSite(projectId: string): Promise<SyncResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/pull`, {
      method: "POST",
    });
  }

  async pushDrupalConfig(projectId: string): Promise<SyncResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/push`, {
      method: "POST",
    });
  }

  async getDrupalSyncStatus(projectId: string): Promise<SyncStatus> {
    return this.request(
      `/api/drupal/${encodeURIComponent(projectId)}/sync-status`
    );
  }

  // Knowledge Base
  async getKBChunks(
    sourceId: string,
    skip?: number,
    limit?: number
  ): Promise<KBChunk[]> {
    const params = new URLSearchParams();
    if (skip !== undefined) params.set("skip", String(skip));
    if (limit !== undefined) params.set("limit", String(limit));
    const query = params.toString();
    return this.request(
      `/api/kb/chunks/${encodeURIComponent(sourceId)}${query ? `?${query}` : ""}`
    );
  }

  async listKBSources(projectId: string): Promise<KBSourceListResponse> {
    return this.request(`/api/kb/sources/${encodeURIComponent(projectId)}`);
  }

  async uploadKBSource(projectId: string, file: File): Promise<KBSource> {
    const formData = new FormData();
    formData.append("project_id", projectId);
    formData.append("file", file);
    const response = await this.rawFetch("/api/kb/sources", {
      method: "POST",
      body: formData,
    });
    return response.json();
  }

  async deleteKBSource(sourceId: string): Promise<void> {
    return this.request(`/api/kb/sources/${encodeURIComponent(sourceId)}`, {
      method: "DELETE",
    });
  }

  async searchKB(data: KBSearchRequest): Promise<KBSearchResponse> {
    return this.request("/api/kb/search", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Admin
  async getKernelDebug(): Promise<KernelDebugInfo> {
    return this.request("/api/admin/kernel/debug");
  }

  async getKernelMetrics(): Promise<KernelMetrics> {
    return this.request("/api/admin/kernel/metrics");
  }

  async getServiceDebug(serviceName: string): Promise<ServiceDebugInfo> {
    return this.request(`/api/admin/kernel/services/${encodeURIComponent(serviceName)}`);
  }

  // Admin User Management
  async listUsers(params?: AdminUserListParams): Promise<AdminUserListResponse> {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.search) searchParams.set("search", params.search);
      if (params.role) searchParams.set("role", params.role);
      if (params.is_active !== undefined) searchParams.set("is_active", String(params.is_active));
      if (params.sort_by) searchParams.set("sort_by", params.sort_by);
      if (params.sort_order) searchParams.set("sort_order", params.sort_order);
      if (params.page !== undefined) searchParams.set("page", String(params.page));
      if (params.page_size !== undefined) searchParams.set("page_size", String(params.page_size));
    }
    const query = searchParams.toString();
    return this.request(`/api/admin/users${query ? `?${query}` : ""}`);
  }

  async getUserDetails(userId: string): Promise<AdminUser> {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}`);
  }

  async updateUserAsAdmin(userId: string, data: AdminUserUpdateRequest): Promise<AdminUserUpdateResponse> {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async unlockUser(userId: string): Promise<UserUnlockResponse> {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}/unlock`, {
      method: "POST",
    });
  }

  // Admin Audit Logs
  async getAuditLogs(params?: AuditLogFilters): Promise<AuditLogListResponse> {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.user_id) searchParams.set("user_id", params.user_id);
      if (params.action) searchParams.set("action", params.action);
      if (params.status) searchParams.set("status", params.status);
      if (params.start_date) searchParams.set("start_date", params.start_date);
      if (params.end_date) searchParams.set("end_date", params.end_date);
      if (params.ip_address) searchParams.set("ip_address", params.ip_address);
      if (params.search) searchParams.set("search", params.search);
      if (params.sort_by) searchParams.set("sort_by", params.sort_by);
      if (params.order) searchParams.set("order", params.order);
      if (params.page !== undefined) searchParams.set("page", String(params.page));
      if (params.page_size !== undefined) searchParams.set("page_size", String(params.page_size));
    }
    const query = searchParams.toString();
    return this.request(`/api/admin/users/audit-logs${query ? `?${query}` : ""}`);
  }

  async exportAuditLogs(
    params?: AuditLogFilters,
    format: "csv" | "json" = "csv"
  ): Promise<Blob> {
    const searchParams = new URLSearchParams();
    searchParams.set("format", format);
    if (params) {
      if (params.user_id) searchParams.set("user_id", params.user_id);
      if (params.action) searchParams.set("action", params.action);
      if (params.status) searchParams.set("status", params.status);
      if (params.start_date) searchParams.set("start_date", params.start_date);
      if (params.end_date) searchParams.set("end_date", params.end_date);
      if (params.ip_address) searchParams.set("ip_address", params.ip_address);
      if (params.search) searchParams.set("search", params.search);
      if (params.sort_by) searchParams.set("sort_by", params.sort_by);
      if (params.order) searchParams.set("order", params.order);
    }

    const response = await this.rawFetch(
      `/api/admin/users/audit-logs/export?${searchParams}`
    );
    return response.blob();
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
