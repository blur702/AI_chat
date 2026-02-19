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
  PerGpuStats,
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
  AssembledContextResponse,
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
  AuditLogListResponse,
  AuditLogFilters,
  StreamEvent,
  StreamToolCallEvent,
  StreamToolResultEvent,
  StreamToolApprovalRequiredEvent,
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
  ComfyUIStartResponse,
  ImageGenerationOptionsResponse,
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
  WebsiteImportRequest,
  WebsiteImportResponse,
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
  DrupalContentType,
  DrupalNodeListResponse,
  DrupalNode,
  DrupalNodeCreateRequest,
  DrupalNodeUpdateRequest,
  DrushCommandRequest,
  DrushCommandResponse,
  SyncStatus,
  SyncResponse,
  StagingStatus,
  CloneRequest,
  CloneResponse,
  PushRequest,
  PushResponse,
  ComposerRequireRequest,
  ComposerRemoveRequest,
  ComposerUpdateRequest,
  ComposerOperationResponse,
  ModuleEnableRequest,
  ModuleDisableRequest,
  ThemeEnableRequest,
  ThemeDisableRequest,
  DrushOperationResponse,
  ModuleThemeListResponse,
  ContentTypeCreateRequest,
  ContentTypeCreateResponse,
  BlockContentCreateRequest,
  BlockContentResponse,
  BlockContentListResponse,
  BlockContentUpdateRequest,
  ThemeScaffoldRequest,
  ThemeScaffoldResponse,
  OllamaModelListResponse,
  ModelActionResponse,
  ModelPullProgress,
  ContextSnippet,
  ContextSnippetCreateRequest,
  ContextSnippetUpdateRequest,
  ContextSnippetListResponse,
  CompactionStatusResponse,
  TechnologyInfo,
  TechnologyListResponse,
  UIComponentInfo,
  UIComponentListResponse,
  UIComponentCreateRequest,
  UIComponentUpdateRequest,
  DockerExportRequest,
  DockerExportResponse,
  PromptPresetCreate,
  PromptPresetUpdate,
  PromptPresetResponse,
  PromptPresetListResponse,
  SavedPaletteCreateRequest,
  SavedPaletteListResponse,
  SavedPaletteResponse,
  SavedPaletteUpdateRequest,
  NoteCreateRequest,
  NoteUpdateRequest,
  NoteResponse,
  NoteListResponse,
  NoteCategoryCreateRequest,
  NoteCategoryUpdateRequest,
  NoteCategoryResponse,
  NoteCategoryListResponse,
  IssueCreateRequest,
  IssueUpdateRequest,
  IssueResponse,
  IssueListResponse,
  StartFixResponse,
} from "./types";

/**
 * Typed error thrown by {@link WorkstationClient} for non-2xx HTTP responses.
 * Carries the numeric `status` code, the raw `statusText`, an optional parsed
 * response `body`, and an optional `retryAfter` value (in seconds) populated
 * when the server returns a 429 Too Many Requests response.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown,
    public retryAfter?: number,
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "ApiError";
  }
}

/** Maximum file size (bytes) the editor should load without warning */
export const MAX_EDITOR_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * HTTP client for the AI Workstation backend API.
 *
 * Handles Bearer-token authentication, exponential-backoff retries on 5xx
 * errors, automatic 429 rate-limit back-off (honoring the `Retry-After`
 * header), per-request timeouts via `AbortController`, and automatic
 * redirect to `/login` on 401 responses.
 *
 * Use {@link getClient} to obtain the shared singleton instance, or
 * construct a dedicated instance for isolated contexts (e.g. tests).
 *
 * @example
 * ```ts
 * const client = getClient();
 * client.setToken(accessToken);
 * const user = await client.getCurrentUser();
 * ```
 */
export class WorkstationClient {
  private baseUrl: string;
  private token: string | null = null;
  private maxRetries: number;
  private retryBaseDelayMs: number;
  private requestTimeoutMs: number;

  constructor(baseUrl?: string, maxRetries = 2, retryBaseDelayMs = 500, requestTimeoutMs = 30_000) {
    this.baseUrl = baseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "";
    this.maxRetries = maxRetries;
    this.retryBaseDelayMs = retryBaseDelayMs;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  /** Store the JWT access token used for all subsequent authenticated requests. */
  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    timeoutMs?: number,
    maxRetriesOverride?: number,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    // Add timeout via AbortController
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(
      () => timeoutController.abort(),
      timeoutMs ?? this.requestTimeoutMs,
    );

    // If the caller passed a signal, forward its abort to our controller
    if (options.signal) {
      options.signal.addEventListener("abort", () => timeoutController.abort(), { once: true });
    }
    const signal = timeoutController.signal;

    const fetchOpts: RequestInit = { ...options, headers, credentials: "include", signal };
    let lastError: unknown;

    try {
      const maxRetries = maxRetriesOverride ?? this.maxRetries;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(`${this.baseUrl}${path}`, fetchOpts);

          if (!response.ok) {
            const body = await response.text().catch(() => undefined);

            // On 401, clear token and redirect to login
            // Skip redirect when already on /login or for the login endpoint itself
            if (response.status === 401) {
              this.token = null;
              const shouldRedirect =
                typeof window !== "undefined" &&
                !path.endsWith("/auth/login") &&
                !window.location.pathname.startsWith("/login");

              if (shouldRedirect) {
                window.location.href = "/login";
              }
              throw new ApiError(response.status, response.statusText, body);
            }

            // Handle 429 Too Many Requests — parse Retry-After and wait
            if (response.status === 429) {
              const retryAfterRaw = response.headers.get("Retry-After");
              const retryAfterSec = retryAfterRaw ? parseInt(retryAfterRaw, 10) : 5;
              const retryAfterMs = (Number.isNaN(retryAfterSec) ? 5 : retryAfterSec) * 1000;

              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("api-error", {
                    detail: {
                      message: "Rate limited. Retrying shortly...",
                      status: 429,
                      retryAfter: retryAfterSec,
                    },
                  }),
                );
              }

              if (attempt < maxRetries) {
                lastError = new ApiError(429, "Too Many Requests", body, retryAfterSec);
                await new Promise((r) => setTimeout(r, retryAfterMs));
                continue;
              }
              throw new ApiError(429, "Too Many Requests", body, retryAfterSec);
            }

            // Emit API error event for toast consumption
            if (
              typeof window !== "undefined" &&
              response.status >= 400 &&
              response.status !== 401
            ) {
              window.dispatchEvent(
                new CustomEvent("api-error", {
                  detail: {
                    message: `${response.status}: ${response.statusText}`,
                    status: response.status,
                  },
                }),
              );
            }

            // Only retry on server errors (5xx), not client errors (4xx)
            if (response.status >= 500 && attempt < maxRetries) {
              lastError = new ApiError(response.status, response.statusText, body);
              await this.delay(attempt);
              continue;
            }
            throw new ApiError(response.status, response.statusText, body);
          }

          if (response.status === 204) {
            return undefined as T;
          }

          return response.json();
        } catch (err) {
          // Surface timeout as a clear error
          if (err instanceof DOMException && err.name === "AbortError") {
            throw new ApiError(0, "Request timed out");
          }

          // Don't retry ApiError (4xx) — already thrown above
          if (err instanceof ApiError && err.status > 0 && err.status < 500) throw err;

          lastError = err;
          if (attempt < maxRetries) {
            await this.delay(attempt);
            continue;
          }
        }
      }

      throw lastError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private delay(attempt: number): Promise<void> {
    const ms = this.retryBaseDelayMs * Math.pow(2, attempt);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Lower-level fetch that adds auth headers and handles 401 redirect,
   * but does NOT assume JSON request/response. Use for FormData uploads
   * and Blob downloads. Includes timeout and basic retry for 429/5xx.
   */
  private async rawFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    // Use a longer timeout for file operations (2x the default)
    const timeoutMs = this.requestTimeoutMs * 2;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    if (options.signal) {
      options.signal.addEventListener("abort", () => timeoutController.abort(), { once: true });
    }

    try {
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          headers,
          credentials: "include",
          signal: timeoutController.signal,
        });

        if (!response.ok) {
          if (response.status === 401) {
            this.token = null;
            const shouldRedirect =
              typeof window !== "undefined" &&
              !path.endsWith("/auth/login") &&
              !window.location.pathname.startsWith("/login");

            if (shouldRedirect) {
              window.location.href = "/login";
            }
          }

          // Retry on 429 with Retry-After
          if (response.status === 429 && attempt < this.maxRetries) {
            const retryAfterRaw = response.headers.get("Retry-After");
            const retryAfterSec = retryAfterRaw ? parseInt(retryAfterRaw, 10) : 5;
            const retryAfterMs = (Number.isNaN(retryAfterSec) ? 5 : retryAfterSec) * 1000;
            await new Promise((r) => setTimeout(r, retryAfterMs));
            continue;
          }

          // Retry on 5xx
          if (response.status >= 500 && attempt < this.maxRetries) {
            await this.delay(attempt);
            continue;
          }

          const body = await response.text().catch(() => undefined);
          throw new ApiError(response.status, response.statusText, body);
        }

        return response;
      }

      throw new ApiError(0, "Max retries exceeded");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiError(0, "Request timed out");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Generic HTTP methods (used by planning hooks etc.)

  /** Issue a generic authenticated GET request and return the response wrapped in `{ data }`. */
  async get<T = unknown>(path: string): Promise<{ data: T }> {
    const data = await this.request<T>(path);
    return { data };
  }

  /** Issue a generic authenticated POST request and return the response wrapped in `{ data }`. */
  async post<T = unknown>(path: string, body?: unknown): Promise<{ data: T }> {
    const data = await this.request<T>(path, {
      method: "POST",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { data };
  }

  /** Issue a generic authenticated PUT request and return the response wrapped in `{ data }`. */
  async put<T = unknown>(path: string, body?: unknown): Promise<{ data: T }> {
    const data = await this.request<T>(path, {
      method: "PUT",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { data };
  }

  /** Issue a generic authenticated DELETE request and return the response wrapped in `{ data }`. */
  async delete<T = unknown>(path: string): Promise<{ data: T }> {
    const data = await this.request<T>(path, { method: "DELETE" });
    return { data };
  }

  // Health

  /** Fetch the top-level application health status from the nginx/backend gateway. */
  async health(): Promise<Record<string, unknown>> {
    return this.request("/health");
  }

  /** Fetch the health status of the backend kernel subsystem. */
  async kernelHealth(): Promise<Record<string, unknown>> {
    return this.request("/api/kernel/health");
  }

  /** Fetch a detailed status summary for all kernel services. */
  async kernelStatus(): Promise<KernelStatusResponse> {
    return this.request("/api/kernel/status", {}, undefined, 0);
  }

  // Auth

  /**
   * Submit user credentials and receive a JWT access token.
   *
   * @example
   * ```ts
   * const { access_token } = await client.login("kevin", "hunter2");
   * client.setToken(access_token);
   * ```
   */
  async login(identifier: string, password: string): Promise<LoginResponse> {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password } satisfies LoginRequest),
    });
  }

  /** Invalidate the current session on the server and clear the stored token. */
  async logout(): Promise<{ message: string }> {
    const result = await this.request<{ message: string }>("/api/auth/logout", {
      method: "POST",
    });
    this.setToken(null);
    return result;
  }

  /** Register a new user account. */
  async createUser(data: UserCreateRequest): Promise<UserCreateResponse> {
    return this.request("/api/auth/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Fetch the profile of the currently authenticated user. */
  async getCurrentUser(): Promise<UserResponse> {
    return this.request("/api/auth/me");
  }

  /** Update profile fields for a specific user by ID. */
  async updateUser(userId: string, data: UserUpdateRequest): Promise<UserResponse> {
    return this.request(`/api/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** Change the authenticated user's password, requiring the current password for verification. */
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<PasswordChangeResponse> {
    return this.request("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      } satisfies PasswordChangeRequest),
    });
  }

  // Resources

  /** Fetch current GPU VRAM allocation statistics. */
  async getVRAMStats(): Promise<VRAMStats> {
    return this.request("/api/resources/vram");
  }

  /** Fetch per-GPU VRAM statistics. */
  async getPerGpuVramStats(): Promise<PerGpuStats[]> {
    return this.request("/api/resources/vram/gpus");
  }

  /** Fetch the overall resource manager status, including loaded model information. */
  async getResourceStatus(): Promise<ResourceStatusResponse> {
    return this.request("/api/resources/status", {}, undefined, 0);
  }

  /** Check whether a resource preemption is required before loading a new model. */
  async checkPreemption(data: PreemptionCheckRequest): Promise<PreemptionCheckResponse> {
    return this.request("/api/resources/check-preemption", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Submit a user decision to offload a model from GPU memory. */
  async submitOffloadDecision(data: OffloadDecisionRequest): Promise<OffloadDecisionResponse> {
    return this.request("/api/resources/offload", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Reload a previously offloaded resource back into GPU memory. */
  async reloadResource(data: ReloadRequest): Promise<OffloadDecisionResponse> {
    return this.request("/api/resources/reload", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Persist a model preference (e.g. default model selection) for a user. */
  async setPreference(data: PreferenceRequest): Promise<PreferenceResponse> {
    return this.request("/api/resources/preference", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Retrieve the stored model preference for a given user. */
  async getPreference(userId: string): Promise<PreferenceResponse> {
    return this.request(`/api/resources/preference/${userId}`);
  }

  // Operations

  /** Persist the state of a long-running operation so it can be resumed or inspected. */
  async saveOperationState(data: OperationStateRequest): Promise<OperationStateResponse> {
    return this.request("/api/operations/state", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Retrieve the persisted state for a specific operation by ID. */
  async getOperationState(operationId: string): Promise<OperationStateResponse> {
    return this.request(`/api/operations/state/${operationId}`);
  }

  /** List recent operations with optional pagination. */
  async listOperations(limit?: number, offset?: number): Promise<OperationListResponse> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (offset !== undefined) params.set("offset", String(offset));
    return this.request(`/api/operations?${params}`);
  }

  // Events

  /** Create a new event record in the event bus. */
  async createEvent(data: EventCreate): Promise<EventResponse> {
    return this.request("/api/events", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** List events with optional filters for type, severity, source, and pagination. */
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

  /** Fetch a single event by its ID. */
  async getEvent(eventId: string): Promise<EventResponse> {
    return this.request(`/api/events/${eventId}`);
  }

  /** Retrieve the list of all registered event type identifiers. */
  async getEventTypes(): Promise<string[]> {
    return this.request("/api/events/types/list");
  }

  /** Fetch aggregate event statistics and counts by type. */
  async getEventStats(): Promise<EventStatsResponse> {
    return this.request("/api/events/stats/summary");
  }

  /** Create an event and broadcast it to all connected WebSocket subscribers. */
  async createEventBroadcast(data: EventCreate): Promise<EventResponse | EventBroadcastResponse> {
    return this.request("/api/events", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Tools

  /** Retrieve metadata for all tools registered in the kernel. */
  async listTools(): Promise<ToolListResponse> {
    return this.request("/api/tools");
  }

  /** Fetch metadata and schema for a single tool by its registered name. */
  async getTool(toolName: string): Promise<ToolInfo> {
    return this.request(`/api/tools/${toolName}`);
  }

  /** Execute a tool directly by name with the given input arguments. */
  async executeTool(data: ToolExecuteRequest): Promise<ToolExecuteResponse> {
    return this.request("/api/tools/execute", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Clear one or more tool output caches to force fresh execution. */
  async clearCache(data: CacheClearRequest): Promise<CacheClearResponse> {
    return this.request("/api/tools/cache/clear", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Context

  /** Fetch the full conversation state (messages, metadata) for a chat session. */
  async getConversationState(chatId: string): Promise<ConversationState> {
    return this.request(`/api/context/conversations/${chatId}`);
  }

  /** Partially update conversation state fields for a chat session. */
  async updateConversationState(
    chatId: string,
    updates: Record<string, unknown>,
  ): Promise<ConversationState> {
    return this.request(`/api/context/conversations/${chatId}`, {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    });
  }

  /** Fetch the context object associated with a project (system prompt, KB sources, etc.). */
  async getProjectContext(projectId: string): Promise<ProjectContext> {
    return this.request(`/api/context/projects/${projectId}`);
  }

  /** List all chat sessions belonging to a project. */
  async getProjectChats(projectId: string): Promise<ChatListResponse> {
    return this.request(`/api/context/project/${projectId}/chats`);
  }

  /** Create a new chat session under the given project. */
  async createChat(projectId: string, title: string): Promise<ChatCreateResponse> {
    return this.request("/api/context/chats", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, title }),
    });
  }

  /** Replace mutable fields on an existing chat session. */
  async updateChat(chatId: string, updates: ChatUpdateRequest): Promise<ChatUpdateResponse> {
    return this.request(`/api/context/chats/${chatId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  /** Convenience wrapper to change only the chat mode (e.g. `"agent"`, `"ask"`). */
  async updateChatMode(chatId: string, mode: string): Promise<ChatUpdateResponse> {
    return this.updateChat(chatId, { chat_mode: mode });
  }

  /** Permanently delete a chat session and its messages. */
  async deleteChat(chatId: string): Promise<void> {
    return this.request(`/api/context/chats/${chatId}`, {
      method: "DELETE",
    });
  }

  /** Return the default chat for a project, creating one if none exists. */
  async getOrCreateProjectChat(projectId: string): Promise<SandboxChatResponse> {
    return this.request(`/api/context/project/${projectId}/default-chat`, {
      method: "POST",
    });
  }

  // Projects

  /** List all projects accessible to the authenticated user. */
  async listProjects(): Promise<ProjectListResponse> {
    return this.request("/api/projects");
  }

  /** Create a new project, optionally backed by a sandbox template. */
  async createProject(data: ProjectCreateRequest): Promise<ProjectCreateResponse> {
    return this.request("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Update metadata or configuration for an existing project. */
  async updateProject(
    projectId: string,
    data: ProjectUpdateRequest,
  ): Promise<ProjectUpdateResponse> {
    return this.request(`/api/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** Permanently delete a project and its associated resources. */
  async deleteProject(projectId: string): Promise<void> {
    return this.request(`/api/projects/${projectId}`, {
      method: "DELETE",
    });
  }

  /** Fetch stored UI/UX preferences for a given user. */
  async getUserPreferences(userId: string): Promise<UserPreferences> {
    return this.request(`/api/context/user/${userId}/preferences`);
  }

  /** Persist updated UI/UX preferences for a given user. */
  async updateUserPreferences(
    userId: string,
    data: UserPreferencesUpdateRequest,
  ): Promise<UserPreferences> {
    return this.request(`/api/context/user/${userId}/preferences`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** List all LLM models available for selection in the chat interface. */
  async listModels(): Promise<ModelListResponse> {
    return this.request("/api/context/models");
  }

  // Ollama Model Management

  /** List all Ollama models currently available on the local Ollama instance. */
  async listOllamaModels(): Promise<OllamaModelListResponse> {
    return this.request("/api/models");
  }

  /** Load an Ollama model into GPU memory, optionally specifying a keep-alive duration. */
  async loadOllamaModel(modelName: string, keepAlive?: string): Promise<ModelActionResponse> {
    return this.request(
      "/api/models/load",
      {
        method: "POST",
        body: JSON.stringify({ model_name: modelName, keep_alive: keepAlive }),
      },
      120_000,
    );
  }

  /** Unload an Ollama model from GPU memory to free VRAM. */
  async unloadOllamaModel(modelName: string): Promise<ModelActionResponse> {
    return this.request(
      "/api/models/unload",
      {
        method: "POST",
        body: JSON.stringify({ model_name: modelName }),
      },
      120_000,
    );
  }

  /** Permanently delete an Ollama model from local storage. */
  async deleteOllamaModel(modelName: string): Promise<ModelActionResponse> {
    return this.request(`/api/models/${encodeURIComponent(modelName)}`, {
      method: "DELETE",
    });
  }

  /**
   * Pull an Ollama model from the registry via a server-sent event stream,
   * reporting download progress incrementally.
   *
   * Returns a cancellation function — call it to abort the in-progress pull.
   *
   * @example
   * ```ts
   * const cancel = client.pullOllamaModel(
   *   "llama3:8b",
   *   (p) => console.log(p.completed, "/", p.total),
   *   () => console.log("done"),
   *   (err) => console.error(err),
   * );
   * // To abort:
   * cancel();
   * ```
   */
  pullOllamaModel(
    modelName: string,
    onProgress: (progress: ModelPullProgress) => void,
    onDone: () => void,
    onError: (error: string) => void,
  ): () => void {
    const controller = new AbortController();

    (async () => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (this.token) {
          headers["Authorization"] = `Bearer ${this.token}`;
        }
        const response = await fetch(`${this.baseUrl}/api/models/pull`, {
          method: "POST",
          signal: controller.signal,
          headers,
          credentials: "include",
          body: JSON.stringify({ model_name: modelName }),
        });
        if (!response.ok || !response.body) {
          if (
            response.status === 401 &&
            typeof window !== "undefined" &&
            !window.location.pathname.startsWith("/login")
          ) {
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

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            try {
              const progress: ModelPullProgress = JSON.parse(jsonStr);
              if (progress.status === "error") {
                onError(progress.message ?? "Pull failed");
                return;
              }
              if (progress.status === "success") {
                onDone();
                return;
              }
              onProgress(progress);
            } catch {
              // skip malformed SSE lines
            }
          }
        }
        // If stream ended without explicit success/error
        onDone();
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        onError(err instanceof Error ? err.message : "Pull connection failed");
      }
    })();

    return () => controller.abort();
  }

  /** Record token usage for a completed chat turn. */
  async trackTokenUsage(chatId: string, data: TokenUsageRequest): Promise<TokenUsageResponse> {
    return this.request(`/api/context/conversations/${chatId}/tokens`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Retrieve cumulative token usage totals for a chat session. */
  async getTokenUsage(chatId: string): Promise<TokenUsageResponse> {
    return this.request(`/api/context/conversations/${chatId}/tokens`);
  }

  /** Tokenize a raw string and return the token count using the active tokenizer. */
  async tokenizeText(text: string): Promise<import("./types").TokenizeResponse> {
    return this.request("/api/context/tokenize", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  }

  // System Prompts

  /** List all saved system prompts available to the authenticated user. */
  async listSystemPrompts(): Promise<SystemPromptListResponse> {
    return this.request("/api/context/system-prompts");
  }

  /** Create a new reusable system prompt. */
  async createSystemPrompt(data: SystemPromptCreateRequest): Promise<SystemPrompt> {
    return this.request("/api/context/system-prompts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Fetch a single system prompt by its ID or slug. */
  async getSystemPrompt(promptId: string): Promise<SystemPrompt> {
    return this.request(`/api/context/system-prompts/${encodeURIComponent(promptId)}`);
  }

  /** Replace the content or metadata of an existing system prompt. */
  async updateSystemPrompt(
    promptId: string,
    data: SystemPromptUpdateRequest,
  ): Promise<SystemPrompt> {
    return this.request(`/api/context/system-prompts/${encodeURIComponent(promptId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** Permanently delete a system prompt. */
  async deleteSystemPrompt(promptId: string): Promise<void> {
    return this.request(`/api/context/system-prompts/${encodeURIComponent(promptId)}`, {
      method: "DELETE",
    });
  }

  // Context Snippets

  /** List all reusable context snippets for the authenticated user. */
  async listSnippets(): Promise<ContextSnippetListResponse> {
    return this.request("/api/context/snippets");
  }

  /** Create a new context snippet (short reusable text block). */
  async createSnippet(data: ContextSnippetCreateRequest): Promise<ContextSnippet> {
    return this.request("/api/context/snippets", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Fetch a single context snippet by its ID. */
  async getSnippet(snippetId: string): Promise<ContextSnippet> {
    return this.request(`/api/context/snippets/${encodeURIComponent(snippetId)}`);
  }

  /** Replace the content or metadata of an existing context snippet. */
  async updateSnippet(
    snippetId: string,
    data: ContextSnippetUpdateRequest,
  ): Promise<ContextSnippet> {
    return this.request(`/api/context/snippets/${encodeURIComponent(snippetId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** Permanently delete a context snippet. */
  async deleteSnippet(snippetId: string): Promise<void> {
    return this.request(`/api/context/snippets/${encodeURIComponent(snippetId)}`, {
      method: "DELETE",
    });
  }

  // Palettes

  /** List all saved colour palettes for the authenticated user. */
  async listPalettes(): Promise<SavedPaletteListResponse> {
    return this.request("/api/palettes");
  }

  /** Save a new colour palette. */
  async createPalette(data: SavedPaletteCreateRequest): Promise<SavedPaletteResponse> {
    return this.request("/api/palettes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Update the name or colour values of an existing saved palette. */
  async updatePalette(
    paletteId: string,
    data: SavedPaletteUpdateRequest,
  ): Promise<SavedPaletteResponse> {
    return this.request(`/api/palettes/${encodeURIComponent(paletteId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** Delete a saved colour palette by ID. */
  async deletePalette(paletteId: string): Promise<void> {
    return this.request(`/api/palettes/${encodeURIComponent(paletteId)}`, {
      method: "DELETE",
    });
  }

  // Compaction Status

  /** Poll the status of a background context-compaction job. */
  async getCompactionStatus(
    chatId: string,
    compactionId: string,
  ): Promise<CompactionStatusResponse> {
    return this.request(
      `/api/context/conversations/${chatId}/compactions/${encodeURIComponent(compactionId)}/status`,
    );
  }

  // Message Actions

  /** Partially update a message (e.g. edit content, add a rating). */
  async updateMessage(
    chatId: string,
    messageId: string,
    data: MessageUpdateRequest,
  ): Promise<MessageUpdateResponse> {
    return this.request(`/api/context/conversations/${chatId}/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  /** Remove a single message from a conversation. */
  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    return this.request(`/api/context/conversations/${chatId}/messages/${messageId}`, {
      method: "DELETE",
    });
  }

  /** Trigger an asynchronous context-compaction (summarisation) job for a chat. */
  async triggerCompaction(
    chatId: string,
  ): Promise<{ status: string; compaction_id?: string; reason?: string }> {
    return this.request(`/api/context/conversations/${chatId}/compact`, {
      method: "POST",
    });
  }

  /** Retrieve a per-role token breakdown for the current context window. */
  async getTokenBreakdown(chatId: string, model?: string): Promise<TokenBreakdownResponse> {
    const params = new URLSearchParams();
    if (model) params.set("model", model);
    const query = params.toString();
    return this.request(
      `/api/context/conversations/${chatId}/token-breakdown${query ? `?${query}` : ""}`,
    );
  }

  /** Return the fully assembled context payload that will be sent to the LLM on the next turn. */
  async getAssembledContext(chatId: string, model?: string): Promise<AssembledContextResponse> {
    const params = new URLSearchParams();
    if (model) params.set("model", model);
    const query = params.toString();
    return this.request(
      `/api/context/conversations/${chatId}/assembled-context${query ? `?${query}` : ""}`,
    );
  }

  /** Edit the human-readable summary text attached to a compaction record. */
  async updateCompactionSummary(
    chatId: string,
    compactionId: string,
    summary: string,
  ): Promise<{ id: string; summary: string; status: string }> {
    return this.request(`/api/context/conversations/${chatId}/compactions/${compactionId}`, {
      method: "PATCH",
      body: JSON.stringify({ summary }),
    });
  }

  /** Persist per-chat custom instructions that are injected into the system prompt. */
  async updateChatInstructions(
    chatId: string,
    instructions: string,
  ): Promise<{ id: string; chat_instructions: string }> {
    return this.request(`/api/context/conversations/${chatId}/chat-instructions`, {
      method: "PATCH",
      body: JSON.stringify({ chat_instructions: instructions }),
    });
  }

  // Streaming

  /**
   * Send a user message and stream the assistant's reply token-by-token via SSE.
   *
   * Returns a cancellation function — call it to abort the in-flight request.
   *
   * @example
   * ```ts
   * let reply = "";
   * const cancel = client.streamMessage(
   *   chatId,
   *   "What is the capital of France?",
   *   (token) => { reply += token; },
   *   (done) => { console.log("message_id:", done.message_id); },
   *   (err) => { console.error(err); },
   * );
   * ```
   */
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
      chat_title?: string;
    }) => void,
    onError: (error: string) => void,
    model?: string,
    chatMode?: string,
    onToolCall?: (event: StreamToolCallEvent) => void,
    onToolResult?: (event: StreamToolResultEvent) => void,
    onToolApprovalRequired?: (event: StreamToolApprovalRequiredEvent) => void,
  ): () => void {
    const url = `${this.baseUrl}/api/context/conversations/${chatId}/messages/stream`;

    const controller = new AbortController();
    const requestBody: Record<string, string> = { content };
    if (model) requestBody.model = model;
    if (chatMode) requestBody.chat_mode = chatMode;

    (async () => {
      let streamStarted = false;
      let fallbackAttempted = false;

      const tryNonStreamingFallback = async (): Promise<boolean> => {
        if (streamStarted || fallbackAttempted) return false;
        fallbackAttempted = true;

        try {
          const fallback = await this.request<{
            message_id: string;
            assistant_message_id: string;
            content: string;
            model: string;
            created_at?: string;
          }>(
            `/api/context/conversations/${chatId}/messages`,
            {
              method: "POST",
              body: JSON.stringify(requestBody),
            },
            undefined,
            0,
          );

          if (fallback.content) {
            onToken(fallback.content);
          }
          onDone({
            message_id: fallback.assistant_message_id || fallback.message_id,
            model: fallback.model,
            created_at: fallback.created_at,
          });
          return true;
        } catch {
          return false;
        }
      };

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        };
        if (this.token) {
          headers["Authorization"] = `Bearer ${this.token}`;
        }
        const response = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers,
          credentials: "include",
          body: JSON.stringify(requestBody),
        });
        if (!response.ok || !response.body) {
          if (response.status === 401 && typeof window !== "undefined") {
            this.token = null;
            window.location.href = "/login";
            return;
          }
          if (response.status >= 500 && (await tryNonStreamingFallback())) {
            return;
          }
          onError(`HTTP ${response.status}: ${response.statusText}`);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          streamStarted = true;

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
                  chat_title: event.chat_title,
                });
              } else if (event.type === "error") {
                onError(event.message);
              } else if (event.type === "tool_call" && onToolCall) {
                onToolCall(event as StreamToolCallEvent);
              } else if (event.type === "tool_result" && onToolResult) {
                onToolResult(event as StreamToolResultEvent);
              } else if (event.type === "tool_approval_required" && onToolApprovalRequired) {
                onToolApprovalRequired(event as StreamToolApprovalRequiredEvent);
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (await tryNonStreamingFallback()) return;
        onError(err instanceof Error ? err.message : "Stream connection failed");
      }
    })();

    return () => controller.abort();
  }

  // Tool approval

  /** Approve or deny a pending tool-call that requires explicit user consent before execution. */
  async submitToolApproval(
    callId: string,
    approved: boolean,
    modifiedArguments?: Record<string, unknown>,
  ): Promise<{ call_id: string; status: string }> {
    return this.request("/api/tool-approvals", {
      method: "POST",
      body: JSON.stringify({
        call_id: callId,
        approved,
        modified_arguments: modifiedArguments,
      }),
    });
  }

  // Sandbox file operations

  /** Fetch the full recursive file tree for a project's sandbox container. */
  async getFileTree(projectId: string): Promise<FileTreeResponse> {
    return this.request(`/api/sandbox/${projectId}/files`);
  }

  /** Read the text content of a file inside the sandbox at the given path. */
  async getFileContent(projectId: string, path: string): Promise<FileContent> {
    const params = new URLSearchParams({ path });
    return this.request(`/api/sandbox/${projectId}/files/content?${params}`);
  }

  /** Create a new file at the specified path inside the sandbox container. */
  async createFile(projectId: string, path: string, content?: string): Promise<FileNode> {
    if (!path || !path.trim()) {
      throw new ApiError(400, "File path cannot be empty");
    }
    return this.request(`/api/sandbox/${projectId}/files`, {
      method: "POST",
      body: JSON.stringify({ path: path.trim(), content: content ?? "" }),
    });
  }

  /** Create a new directory at the specified path inside the sandbox container. */
  async createDirectory(projectId: string, path: string): Promise<FileNode> {
    return this.request(`/api/sandbox/${projectId}/directories`, {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  }

  /** Overwrite the content of an existing file inside the sandbox. */
  async updateFile(projectId: string, path: string, content: string): Promise<FileNode> {
    return this.request(`/api/sandbox/${projectId}/files`, {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    });
  }

  /** Rename or move a file within the sandbox container. */
  async renameFile(projectId: string, oldPath: string, newPath: string): Promise<FileNode> {
    if (!newPath || !newPath.trim()) {
      throw new ApiError(400, "New file path cannot be empty");
    }
    return this.request(`/api/sandbox/${projectId}/files/rename`, {
      method: "PUT",
      body: JSON.stringify({ old_path: oldPath, new_path: newPath.trim() }),
    });
  }

  /** Delete a file or directory from the sandbox container. */
  async deleteFile(projectId: string, path: string): Promise<void> {
    const params = new URLSearchParams({ path });
    return this.request(`/api/sandbox/${projectId}/files?${params}`, {
      method: "DELETE",
    });
  }

  /** Stop the running Docker sandbox container for a project. */
  async stopSandbox(projectId: string): Promise<{ project_id: string; stopped: boolean }> {
    return this.request(`/api/sandbox/${projectId}/stop`, { method: "POST" });
  }

  // Automation Actions

  /** Queue a new automation action for a project, pending user approval. */
  async createAutomationAction(
    projectId: string,
    actionType: string,
    actionData?: Record<string, unknown>,
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

  /** List automation actions for a project, optionally filtered by approval or execution state. */
  async listAutomationActions(
    projectId: string,
    filters?: { approved?: boolean; executed?: boolean },
  ): Promise<AutomationActionListResponse> {
    const params = new URLSearchParams();
    if (filters?.approved !== undefined) params.set("approved", String(filters.approved));
    if (filters?.executed !== undefined) params.set("executed", String(filters.executed));
    return this.request(`/api/automation/actions/${projectId}?${params}`);
  }

  /** Mark an automation action as approved, optionally supplying modified action data. */
  async approveAutomationAction(
    actionId: string,
    modifiedData?: Record<string, unknown>,
  ): Promise<AutomationAction> {
    return this.request(`/api/automation/actions/${actionId}/approve`, {
      method: "PUT",
      body: JSON.stringify(modifiedData !== undefined ? { action_data: modifiedData } : {}),
    });
  }

  /** Run an approved automation action immediately. */
  async executeAutomationAction(actionId: string): Promise<AutomationActionExecuteResponse> {
    return this.request(`/api/automation/actions/${actionId}/execute`, {
      method: "POST",
    });
  }

  /** Cancel and remove a pending automation action. */
  async deleteAutomationAction(actionId: string): Promise<void> {
    return this.request(`/api/automation/actions/${actionId}`, {
      method: "DELETE",
    });
  }

  // YOLO Edits

  /** List the history of autonomous file edits made by the agent in a project. */
  async listYoloEdits(
    projectId: string,
    filters?: { limit?: number; offset?: number; undo_performed?: boolean },
  ): Promise<YoloEditListResponse> {
    const params = new URLSearchParams();
    if (filters?.limit !== undefined) params.set("limit", String(filters.limit));
    if (filters?.offset !== undefined) params.set("offset", String(filters.offset));
    if (filters?.undo_performed !== undefined)
      params.set("undo_performed", String(filters.undo_performed));
    return this.request(`/api/yolo/edits/${projectId}?${params}`);
  }

  /** Fetch the full diff and metadata for a single YOLO edit record. */
  async getYoloEditDetail(editId: string): Promise<YoloEdit> {
    return this.request(`/api/yolo/edits/${editId}/detail`);
  }

  /** Revert a YOLO edit, restoring the file to its pre-edit state. */
  async undoYoloEdit(editId: string): Promise<YoloEditUndoResponse> {
    return this.request(`/api/yolo/edits/${editId}/undo`, {
      method: "POST",
    });
  }

  // Image Generation

  /** Enqueue an image generation job via ComfyUI and return the resulting job record. */
  async generateImage(data: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const payload: ImageGenerationRequest = {
      project_id: data.project_id,
      workflow_type: data.workflow_type,
      ...(data.system_context ? { system_context: data.system_context } : {}),
      prompt: data.prompt,
      negative_prompt: data.negative_prompt,
      width: data.width,
      height: data.height,
      steps: data.steps,
      cfg_scale: data.cfg_scale,
      ...(data.input_image ? { input_image: data.input_image } : {}),
      ...(data.mask_image ? { mask_image: data.mask_image } : {}),
      ...(data.target_image ? { target_image: data.target_image } : {}),
      ...(data.denoise !== undefined ? { denoise: data.denoise } : {}),
      ...(data.morph_strength !== undefined ? { morph_strength: data.morph_strength } : {}),
      ...(data.seed !== undefined ? { seed: data.seed } : {}),
      ...(data.sampler_name ? { sampler_name: data.sampler_name } : {}),
      ...(data.scheduler ? { scheduler: data.scheduler } : {}),
      ...(data.batch_size !== undefined ? { batch_size: data.batch_size } : {}),
      ...(data.model_name ? { model_name: data.model_name } : {}),
      ...(data.loras && data.loras.length > 0 ? { loras: data.loras } : {}),
    };

    return this.request("/api/image/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /** Fetch available image generation options such as samplers, schedulers, and loaded checkpoints. */
  async getImageGenerationOptions(): Promise<ImageGenerationOptionsResponse> {
    return this.request("/api/image/options");
  }

  /** Poll the current status of a queued or in-progress image generation job. */
  async getGenerationStatus(jobId: string): Promise<ImageGenerationResponse> {
    return this.request(`/api/image/status/${encodeURIComponent(jobId)}`);
  }

  /** Fetch the completed result of an image generation job. */
  async getGenerationResult(jobId: string): Promise<ImageGenerationResponse> {
    return this.request(`/api/image/result/${encodeURIComponent(jobId)}`);
  }

  /** List image generation jobs with optional project, pagination, and status filters. */
  async listGenerations(
    projectId?: string,
    skip?: number,
    limit?: number,
    status?: string,
  ): Promise<ImageGenerationListResponse> {
    const params = new URLSearchParams();
    if (projectId) params.set("project_id", projectId);
    if (skip !== undefined) params.set("skip", String(skip));
    if (limit !== undefined) params.set("limit", String(limit));
    if (status) params.set("status", status);

    const query = params.toString();
    return this.request(`/api/image/generations${query ? `?${query}` : ""}`);
  }

  /** Download a generated image file as a `Blob` for local save or preview. */
  async downloadImage(jobId: string, filename: string): Promise<Blob> {
    const response = await this.rawFetch(
      `/api/image/download/${encodeURIComponent(jobId)}/${encodeURIComponent(filename)}`,
    );
    return response.blob();
  }

  /** Permanently delete an image generation record and its associated output files. */
  async deleteGeneration(jobId: string): Promise<void> {
    return this.request(`/api/image/generations/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    });
  }

  /** Start the ComfyUI service if it is not already running. */
  async startComfyUI(): Promise<ComfyUIStartResponse> {
    return this.request("/api/image/comfyui/start", {
      method: "POST",
    });
  }

  // Templates

  /** List sandbox project templates, optionally filtered by category. */
  async getTemplates(category?: string): Promise<TemplateListResponse> {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    const query = params.toString();
    return this.request(`/api/templates${query ? `?${query}` : ""}`);
  }

  /** Fetch the full definition for a single sandbox template by ID. */
  async getTemplate(templateId: string): Promise<TemplateInfo> {
    return this.request(`/api/templates/${encodeURIComponent(templateId)}`);
  }

  // Technologies

  /** List technology entries (language/framework metadata), optionally filtered by category. */
  async getTechnologies(category?: string): Promise<TechnologyListResponse> {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    const query = params.toString();
    return this.request(`/api/templates/technologies${query ? `?${query}` : ""}`);
  }

  /** Fetch the metadata record for a single technology by its ID. */
  async getTechnology(techId: string): Promise<TechnologyInfo> {
    return this.request(`/api/templates/technologies/${encodeURIComponent(techId)}`);
  }

  // UI Components

  /** List the UI component library, optionally filtered by category, framework, or tags. */
  async listUIComponents(params?: {
    category?: string;
    framework?: string;
    tags?: string[];
  }): Promise<UIComponentListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    if (params?.framework) searchParams.set("framework", params.framework);
    if (params?.tags) searchParams.set("tags", params.tags.join(","));
    const query = searchParams.toString();
    return this.request(`/api/ui-components${query ? `?${query}` : ""}`);
  }

  /** Fetch metadata and code snippet for a single UI component. */
  async getUIComponent(componentId: string): Promise<UIComponentInfo> {
    return this.request(`/api/ui-components/${encodeURIComponent(componentId)}`);
  }

  /** Add a new UI component to the shared library. */
  async createUIComponent(data: UIComponentCreateRequest): Promise<UIComponentInfo> {
    return this.request("/api/ui-components", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Replace the definition of an existing UI component. */
  async updateUIComponent(
    componentId: string,
    data: UIComponentUpdateRequest,
  ): Promise<UIComponentInfo> {
    return this.request(`/api/ui-components/${encodeURIComponent(componentId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** Remove a UI component from the shared library. */
  async deleteUIComponent(componentId: string): Promise<void> {
    return this.request(`/api/ui-components/${encodeURIComponent(componentId)}`, {
      method: "DELETE",
    });
  }

  // Docker Export

  /** Build a Docker image from a project's sandbox and return the image metadata. */
  async exportAsDocker(
    projectId: string,
    data: DockerExportRequest,
  ): Promise<DockerExportResponse> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/export-docker`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Download the built Docker image as a `.tar` archive `Blob`. */
  async downloadDockerTar(projectId: string, imageId: string): Promise<Blob> {
    const response = await this.rawFetch(
      `/api/projects/${encodeURIComponent(projectId)}/export-docker/${encodeURIComponent(imageId)}/download`,
    );
    return response.blob();
  }

  // Project Import / Export / Snapshots

  /** Import a project from a remote Git repository URL. */
  async importFromGit(data: GitImportRequest): Promise<GitImportResponse> {
    return this.request("/api/projects/import/git", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Scrape a website and create a project from the downloaded content. */
  async importFromWebsite(data: WebsiteImportRequest): Promise<WebsiteImportResponse> {
    return this.request("/api/projects/import/website", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Upload a zip/tar archive and import it as a new project. */
  async importFromArchive(
    name: string,
    file: File,
    installDeps?: boolean,
    path?: string,
  ): Promise<ArchiveUploadResponse> {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("file", file);
    if (installDeps !== undefined) formData.append("install_deps", String(installDeps));
    if (path) formData.append("path", path);

    const response = await this.rawFetch("/api/projects/import/upload", {
      method: "POST",
      body: formData,
    });
    return response.json();
  }

  /** Poll the progress of an ongoing project import job. */
  async getImportStatus(importId: string): Promise<ImportStatusResponse> {
    return this.request(`/api/projects/import/${encodeURIComponent(importId)}/status`);
  }

  /** Run heuristic detection to identify the project's primary language and framework. */
  async detectProjectType(projectId: string): Promise<DetectionResultResponse> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/detect-type`, {
      method: "POST",
    });
  }

  /** Export a project's sandbox filesystem as a downloadable zip archive `Blob`. */
  async exportProject(projectId: string): Promise<Blob> {
    const response = await this.rawFetch(`/api/projects/${encodeURIComponent(projectId)}/export`, {
      method: "POST",
    });
    return response.blob();
  }

  /** Duplicate an existing project into a new project with a different name. */
  async cloneProject(projectId: string, data: CloneProjectRequest): Promise<CloneProjectResponse> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/clone`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Create a named filesystem snapshot of the project's current sandbox state. */
  async createSnapshot(projectId: string, data: SnapshotCreateRequest): Promise<SnapshotInfo> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/snapshots`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** List all named snapshots for a project. */
  async listSnapshots(projectId: string): Promise<SnapshotListResponse> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/snapshots`);
  }

  /** Roll back a project's sandbox to a previously saved snapshot. */
  async restoreSnapshot(projectId: string, name: string): Promise<SnapshotRestoreResponse> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(name)}/restore`,
      { method: "POST" },
    );
  }

  /** Delete a named project snapshot. */
  async deleteSnapshot(projectId: string, name: string): Promise<void> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    );
  }

  // Drupal MCP

  /** Register a remote Drupal site with a project by providing its connection credentials. */
  async connectDrupalSite(
    projectId: string,
    data: DrupalConnectRequest,
  ): Promise<DrupalConnectResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/connect`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Fetch the connected Drupal site info (URL, version, etc.) for a project. */
  async getDrupalSite(projectId: string): Promise<DrupalSiteInfo> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/site`);
  }

  /** Remove the Drupal site connection from a project. */
  async disconnectDrupalSite(projectId: string): Promise<void> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/site`, {
      method: "DELETE",
    });
  }

  /** Retrieve the Drupal site configuration (modules, theme, settings) for a project. */
  async getDrupalConfig(projectId: string): Promise<DrupalSiteConfig> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/config`);
  }

  /** Execute a Drush CLI command against the connected Drupal site. */
  async runDrush(projectId: string, command: string): Promise<DrushCommandResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/drush`, {
      method: "POST",
      body: JSON.stringify({ command } satisfies DrushCommandRequest),
    });
  }

  /** Pull the latest content and configuration from the live Drupal site into the project. */
  async pullDrupalSite(projectId: string): Promise<SyncResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/pull`, {
      method: "POST",
    });
  }

  /** Push locally modified Drupal configuration back to the connected site. */
  async pushDrupalConfig(projectId: string): Promise<SyncResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/push`, {
      method: "POST",
    });
  }

  /** Fetch the current sync status (ahead/behind, dirty files) between local and remote Drupal. */
  async getDrupalSyncStatus(projectId: string): Promise<SyncStatus> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/sync-status`);
  }

  // Drupal Staging (SSH-based clone/push)

  /** Fetch the status of the local Drupal staging environment for a project. */
  async getDrupalStagingStatus(projectId: string): Promise<StagingStatus> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/staging-status`);
  }

  /** Clone the production Drupal database and files into the local staging environment via SSH. */
  async cloneDrupalProduction(projectId: string, data?: CloneRequest): Promise<CloneResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/clone`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  }

  /** Push locally staged Drupal changes to the production server via SSH. */
  async pushDrupalToProduction(projectId: string, data: PushRequest): Promise<PushResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/staging/push`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Start the local Drupal staging server (e.g. PHP-FPM + nginx inside the sandbox). */
  async startDrupalStaging(projectId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/staging/start`, {
      method: "POST",
    });
  }

  /** Stop the local Drupal staging server for a project. */
  async stopDrupalStaging(projectId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/staging/stop`, {
      method: "POST",
    });
  }

  /** List the available content types defined on the connected Drupal site. */
  async getDrupalContentTypes(projectId: string): Promise<DrupalContentType[]> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/content-types`);
  }

  /** List nodes of a specific content-type bundle from the connected Drupal site. */
  async listDrupalContent(projectId: string, bundle: string): Promise<DrupalNodeListResponse> {
    return this.request(
      `/api/drupal/${encodeURIComponent(projectId)}/content/${encodeURIComponent(bundle)}`,
    );
  }

  /** Create a new Drupal node of the given content-type bundle. */
  async createDrupalNode(
    projectId: string,
    bundle: string,
    data: DrupalNodeCreateRequest,
  ): Promise<DrupalNode> {
    return this.request(
      `/api/drupal/${encodeURIComponent(projectId)}/content/${encodeURIComponent(bundle)}`,
      { method: "POST", body: JSON.stringify(data) },
    );
  }

  /** Partially update an existing Drupal node identified by UUID. */
  async updateDrupalNode(
    projectId: string,
    bundle: string,
    nodeUuid: string,
    data: DrupalNodeUpdateRequest,
  ): Promise<DrupalNode> {
    return this.request(
      `/api/drupal/${encodeURIComponent(projectId)}/content/${encodeURIComponent(bundle)}/${encodeURIComponent(nodeUuid)}`,
      { method: "PATCH", body: JSON.stringify(data) },
    );
  }

  // Drupal Module/Theme Management

  /** List installed modules on the connected Drupal site. */
  async listDrupalModules(
    projectId: string,
    statusFilter?: string,
  ): Promise<ModuleThemeListResponse> {
    const params = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/modules${params}`);
  }

  /** List installed themes on the connected Drupal site. */
  async listDrupalThemes(
    projectId: string,
    statusFilter?: string,
  ): Promise<ModuleThemeListResponse> {
    const params = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/themes${params}`);
  }

  /** Enable one or more Drupal modules via drush. */
  async enableDrupalModules(
    projectId: string,
    data: ModuleEnableRequest,
  ): Promise<DrushOperationResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/modules/enable`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Disable (uninstall) one or more Drupal modules via drush. */
  async disableDrupalModules(
    projectId: string,
    data: ModuleDisableRequest,
  ): Promise<DrushOperationResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/modules/disable`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Enable a Drupal theme, optionally setting it as default. */
  async enableDrupalTheme(
    projectId: string,
    data: ThemeEnableRequest,
  ): Promise<DrushOperationResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/themes/enable`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Disable (uninstall) a Drupal theme. */
  async disableDrupalTheme(
    projectId: string,
    data: ThemeDisableRequest,
  ): Promise<DrushOperationResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/themes/disable`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Drupal Composer Operations

  /** Install a package via composer require on the remote Drupal site. */
  async composerRequire(
    projectId: string,
    data: ComposerRequireRequest,
  ): Promise<ComposerOperationResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/composer/require`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Remove a package via composer remove on the remote Drupal site. */
  async composerRemove(
    projectId: string,
    data: ComposerRemoveRequest,
  ): Promise<ComposerOperationResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/composer/remove`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Update packages via composer update on the remote Drupal site. */
  async composerUpdate(
    projectId: string,
    data: ComposerUpdateRequest,
  ): Promise<ComposerOperationResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/composer/update`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Drupal Content Type & Block Content Management

  /** Create a new content type on the connected Drupal site. */
  async createDrupalContentType(
    projectId: string,
    data: ContentTypeCreateRequest,
  ): Promise<ContentTypeCreateResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/content-types/create`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** List block content entities of a given bundle. */
  async listDrupalBlocks(
    projectId: string,
    bundle: string,
  ): Promise<BlockContentListResponse> {
    return this.request(
      `/api/drupal/${encodeURIComponent(projectId)}/blocks/${encodeURIComponent(bundle)}`,
    );
  }

  /** Create a new block content entity. */
  async createDrupalBlock(
    projectId: string,
    bundle: string,
    data: BlockContentCreateRequest,
  ): Promise<BlockContentResponse> {
    return this.request(
      `/api/drupal/${encodeURIComponent(projectId)}/blocks/${encodeURIComponent(bundle)}`,
      { method: "POST", body: JSON.stringify(data) },
    );
  }

  /** Update an existing block content entity. */
  async updateDrupalBlock(
    projectId: string,
    bundle: string,
    blockUuid: string,
    data: BlockContentUpdateRequest,
  ): Promise<BlockContentResponse> {
    return this.request(
      `/api/drupal/${encodeURIComponent(projectId)}/blocks/${encodeURIComponent(bundle)}/${encodeURIComponent(blockUuid)}`,
      { method: "PATCH", body: JSON.stringify(data) },
    );
  }

  /** Scaffold a new custom Drupal theme on the remote VPS. */
  async scaffoldDrupalTheme(
    projectId: string,
    data: ThemeScaffoldRequest,
  ): Promise<ThemeScaffoldResponse> {
    return this.request(`/api/drupal/${encodeURIComponent(projectId)}/themes/scaffold`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Knowledge Base

  /** Fetch paginated text chunks that belong to a specific KB source document. */
  async getKBChunks(sourceId: string, skip?: number, limit?: number): Promise<KBChunk[]> {
    const params = new URLSearchParams();
    if (skip !== undefined) params.set("skip", String(skip));
    if (limit !== undefined) params.set("limit", String(limit));
    const query = params.toString();
    return this.request(
      `/api/kb/chunks/${encodeURIComponent(sourceId)}${query ? `?${query}` : ""}`,
    );
  }

  /** List all knowledge-base source documents associated with a project. */
  async listKBSources(projectId: string): Promise<KBSourceListResponse> {
    return this.request(`/api/kb/sources/${encodeURIComponent(projectId)}`);
  }

  /** Upload a file as a new KB source and trigger background ingestion/embedding. */
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

  /** Delete a KB source document and its associated chunks from the vector store. */
  async deleteKBSource(sourceId: string): Promise<void> {
    return this.request(`/api/kb/sources/${encodeURIComponent(sourceId)}`, {
      method: "DELETE",
    });
  }

  /** Perform a semantic similarity search over the project's knowledge base. */
  async searchKB(data: KBSearchRequest): Promise<KBSearchResponse> {
    return this.request("/api/kb/search", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // KB Builder Wizard

  /** Upload multiple files at once for batch KB ingestion (wizard step 1). */
  async bulkUploadKB(files: File[]): Promise<import("./types").KBBulkUploadResponse> {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }
    const response = await this.rawFetch("/api/kb/bulk-upload", {
      method: "POST",
      body: formData,
    });
    return response.json();
  }

  /** Extract and preview text from a file using OCR or vision before ingestion (wizard step 2). */
  async extractPreviewKB(
    file: File,
    method?: "ocr" | "vision",
  ): Promise<import("./types").KBExtractPreviewResponse> {
    const formData = new FormData();
    formData.append("file", file);
    const query = method ? `?method=${method}` : "";
    const response = await this.rawFetch(`/api/kb/extract-preview${query}`, {
      method: "POST",
      body: formData,
    });
    return response.json();
  }

  /** Preview how extracted text will be split into chunks given the specified chunking parameters. */
  async chunkPreviewKB(
    data: import("./types").KBChunkPreviewRequest,
  ): Promise<import("./types").KBChunkPreviewResponse> {
    return this.request("/api/kb/chunk-preview", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** List available embedding models that can be used during KB ingestion. */
  async listEmbeddingModels(): Promise<import("./types").KBEmbeddingModelsResponse> {
    return this.request("/api/kb/embedding-models");
  }

  /** Trigger batch embedding and vector-store ingestion for a set of uploaded KB files. */
  async bulkIngestKB(
    data: import("./types").KBBulkIngestRequest,
  ): Promise<import("./types").KBBulkIngestResponse> {
    return this.request("/api/kb/bulk-ingest", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Poll the processing status of a bulk KB ingestion batch job. */
  async getBulkStatus(batchId: string): Promise<import("./types").KBBulkStatusResponse> {
    return this.request(`/api/kb/bulk-status/${encodeURIComponent(batchId)}`);
  }

  // Admin

  /** Fetch low-level debug information for all kernel services (admin only). */
  async getKernelDebug(): Promise<KernelDebugInfo> {
    return this.request("/api/admin/kernel/debug");
  }

  /** Retrieve kernel performance metrics (queue depths, latency histograms, etc.). */
  async getKernelMetrics(): Promise<KernelMetrics> {
    return this.request("/api/admin/kernel/metrics");
  }

  /** Fetch debug information for a single named kernel service. */
  async getServiceDebug(serviceName: string): Promise<ServiceDebugInfo> {
    return this.request(`/api/admin/kernel/services/${encodeURIComponent(serviceName)}`);
  }

  // Admin User Management

  /** List all registered users with optional search, role, and pagination filters (admin only). */
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

  /** Fetch the full admin-level profile for a single user by ID. */
  async getUserDetails(userId: string): Promise<AdminUser> {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}`);
  }

  /** Update a user's role, active status, or other admin-controlled fields. */
  async updateUserAsAdmin(
    userId: string,
    data: AdminUserUpdateRequest,
  ): Promise<AdminUserUpdateResponse> {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** Clear a user's lockout state so they can log in again after failed attempts. */
  async unlockUser(userId: string): Promise<UserUnlockResponse> {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}/unlock`, {
      method: "POST",
    });
  }

  // Admin Audit Logs

  /** Query the admin audit log with optional filters for user, action, date range, and IP. */
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

  /** Export the admin audit log as a downloadable CSV or JSON `Blob`. */
  async exportAuditLogs(params?: AuditLogFilters, format: "csv" | "json" = "csv"): Promise<Blob> {
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

    const response = await this.rawFetch(`/api/admin/users/audit-logs/export?${searchParams}`);
    return response.blob();
  }

  // ---- Help Topics ----

  /** List all help topics available in the in-app help system. */
  async listHelpTopics(): Promise<import("./types").HelpTopicListResponse> {
    return this.request("/api/help");
  }

  /** Semantic search over help topics using an embedded query string. */
  async searchHelpTopics(query: string, topK = 10): Promise<import("./types").HelpSearchResponse> {
    return this.request("/api/help/search", {
      method: "POST",
      body: JSON.stringify({ query, top_k: topK }),
    });
  }

  /** Create a new help topic entry (admin only). */
  async createHelpTopic(
    data: import("./types").HelpTopicCreateRequest,
  ): Promise<import("./types").HelpTopic> {
    return this.request("/api/help", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Update an existing help topic's content or metadata (admin only). */
  async updateHelpTopic(
    topicId: string,
    data: import("./types").HelpTopicUpdateRequest,
  ): Promise<import("./types").HelpTopic> {
    return this.request(`/api/help/${encodeURIComponent(topicId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** Delete a help topic (admin only). */
  async deleteHelpTopic(topicId: string): Promise<void> {
    await this.request(`/api/help/${encodeURIComponent(topicId)}`, { method: "DELETE" });
  }

  /** Submit "helpful / not helpful" feedback for a help topic. */
  async submitHelpFeedback(
    topicId: string,
    data: import("./types").HelpFeedbackSubmitRequest,
  ): Promise<import("./types").HelpFeedbackSubmitResponse> {
    return this.request(`/api/help/${encodeURIComponent(topicId)}/feedback`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Get feedback summary for one help topic. */
  async getHelpFeedbackSummary(
    topicId: string,
  ): Promise<import("./types").HelpFeedbackSummary> {
    return this.request(`/api/help/${encodeURIComponent(topicId)}/feedback`);
  }

  /** Get feedback summaries for multiple topics (optionally filtered by section). */
  async listHelpFeedbackSummaries(
    params?: { section_id?: string; limit?: number; offset?: number },
  ): Promise<import("./types").HelpFeedbackSummaryListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.section_id) searchParams.set("section_id", params.section_id);
    if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
    if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));
    const query = searchParams.toString();
    return this.request(`/api/help/feedback/summary${query ? `?${query}` : ""}`);
  }

  // ---- Prompt Presets ----

  /** List prompt presets with optional category, text search, and ownership filters. */
  async listPromptPresets(params?: {
    category?: string;
    search?: string;
    mine_only?: boolean;
    skip?: number;
    limit?: number;
  }): Promise<PromptPresetListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.mine_only) searchParams.set("mine_only", "true");
    if (params?.skip !== undefined) searchParams.set("skip", String(params.skip));
    if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    return this.request(`/api/prompt-presets${query ? `?${query}` : ""}`);
  }

  /** Fetch a single prompt preset by its ID. */
  async getPromptPreset(presetId: string): Promise<PromptPresetResponse> {
    return this.request(`/api/prompt-presets/${encodeURIComponent(presetId)}`);
  }

  /** Save a new prompt preset for quick reuse in the chat interface. */
  async createPromptPreset(data: PromptPresetCreate): Promise<PromptPresetResponse> {
    return this.request("/api/prompt-presets", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Replace the content or metadata of an existing prompt preset. */
  async updatePromptPreset(
    presetId: string,
    data: PromptPresetUpdate,
  ): Promise<PromptPresetResponse> {
    return this.request(`/api/prompt-presets/${encodeURIComponent(presetId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** Delete a prompt preset. */
  async deletePromptPreset(presetId: string): Promise<void> {
    return this.request(`/api/prompt-presets/${encodeURIComponent(presetId)}`, {
      method: "DELETE",
    });
  }

  // ---- Drupal Local Development ----

  /** List the file tree of the local Drupal installation on the VPS host. */
  async getDrupalLocalFiles(path?: string): Promise<import("./types").DrupalLocalFileTreeResponse> {
    const params = new URLSearchParams();
    if (path) params.set("path", path);
    const query = params.toString();
    return this.request(`/api/drupal-local/files${query ? `?${query}` : ""}`);
  }

  /** Read the contents of a single file in the local Drupal installation. */
  async getDrupalLocalFileContent(path: string): Promise<import("./types").DrupalLocalFileContent> {
    const params = new URLSearchParams({ path });
    return this.request(`/api/drupal-local/files/content?${params}`);
  }

  /** Write updated content to a file in the local Drupal installation. */
  async updateDrupalLocalFile(
    path: string,
    content: string,
  ): Promise<{ path: string; size: number }> {
    return this.request("/api/drupal-local/files/content", {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    });
  }

  /** Create a new file in the local Drupal installation. */
  async createDrupalLocalFile(
    path: string,
    content?: string,
  ): Promise<{ path: string; name: string; type: string }> {
    return this.request("/api/drupal-local/files", {
      method: "POST",
      body: JSON.stringify({ path, content: content ?? "" }),
    });
  }

  /** Create a new directory in the local Drupal installation. */
  async createDrupalLocalDirectory(
    path: string,
  ): Promise<{ path: string; name: string; type: string }> {
    return this.request("/api/drupal-local/files/directory", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  }

  /** Delete a file or directory from the local Drupal installation. */
  async deleteDrupalLocalFile(path: string): Promise<void> {
    const params = new URLSearchParams({ path });
    return this.request(`/api/drupal-local/files?${params}`, { method: "DELETE" });
  }

  /** Rename or move a file within the local Drupal installation. */
  async renameDrupalLocalFile(
    oldPath: string,
    newPath: string,
  ): Promise<{ path: string; name: string; type: string }> {
    return this.request("/api/drupal-local/files/rename", {
      method: "POST",
      body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
    });
  }

  /** Run a Drush command against the local Drupal installation on the VPS host. */
  async runDrupalLocalDrush(command: string): Promise<import("./types").DrupalLocalDrushResponse> {
    return this.request("/api/drupal-local/drush", {
      method: "POST",
      body: JSON.stringify({ command }),
    });
  }

  /** List all enabled and available modules for the local Drupal installation. */
  async getDrupalLocalModules(): Promise<{ modules: import("./types").DrupalLocalModuleInfo[] }> {
    return this.request("/api/drupal-local/modules");
  }

  /** List all themes installed in the local Drupal installation. */
  async getDrupalLocalThemes(): Promise<{ themes: import("./types").DrupalLocalThemeInfo[] }> {
    return this.request("/api/drupal-local/themes");
  }

  /** Scaffold a new custom Drupal module with boilerplate files. */
  async scaffoldDrupalLocalModule(
    data: import("./types").DrupalLocalModuleScaffoldRequest,
  ): Promise<import("./types").DrupalLocalModuleScaffoldResponse> {
    return this.request("/api/drupal-local/scaffold/module", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Fetch the overall health and version status of the local Drupal site. */
  async getDrupalLocalStatus(): Promise<import("./types").DrupalLocalSiteStatus> {
    return this.request("/api/drupal-local/status");
  }

  /** Check whether the local Drupal configuration is in sync with the active database config. */
  async getDrupalLocalConfigStatus(): Promise<import("./types").DrupalLocalConfigStatus> {
    return this.request("/api/drupal-local/config/status");
  }

  /** Export the active Drupal configuration to the filesystem sync directory. */
  async exportDrupalLocalConfig(): Promise<import("./types").DrupalLocalDrushResult> {
    return this.request("/api/drupal-local/config/export", { method: "POST" });
  }

  /** Import the filesystem sync-directory configuration into the active Drupal database. */
  async importDrupalLocalConfig(): Promise<import("./types").DrupalLocalDrushResult> {
    return this.request("/api/drupal-local/config/import", { method: "POST" });
  }

  /** Generate a colour palette from a seed colour or description using the AI palette service. */
  async generatePalette(
    data: import("./types").PaletteGenerateRequest,
  ): Promise<import("./types").PaletteResponse> {
    return this.request("/api/drupal-local/palette/generate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Validate a set of hex colour values for contrast and accessibility compliance. */
  async validatePalette(colors: string[]): Promise<import("./types").PaletteResponse> {
    return this.request("/api/drupal-local/palette/validate", {
      method: "POST",
      body: JSON.stringify({ colors }),
    });
  }

  /** Adjust a colour palette to improve contrast ratios and accessibility scores. */
  async adjustPalette(colors: string[]): Promise<import("./types").PaletteResponse> {
    return this.request("/api/drupal-local/palette/adjust", {
      method: "POST",
      body: JSON.stringify({ colors }),
    });
  }

  // ---- Image Generation Extras ----

  /** Toggle the favourite flag on a generated image. */
  async toggleFavorite(jobId: string): Promise<ImageGenerationResponse> {
    return this.request(`/api/image/generations/${encodeURIComponent(jobId)}/favorite`, {
      method: "PATCH",
    });
  }

  /** Upscale a previously generated image using a high-resolution upscale model. */
  async upscaleImage(jobId: string, upscaleModel?: string): Promise<ImageGenerationResponse> {
    return this.request(`/api/image/upscale/${encodeURIComponent(jobId)}`, {
      method: "POST",
      body: JSON.stringify({ upscale_model: upscaleModel }),
    });
  }

  // ---- Notes ----

  /** List notes with optional filters for project, category, status, and pinned. */
  async listNotes(params?: {
    project_id?: string;
    category_id?: string;
    status?: string;
    pinned?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<NoteListResponse> {
    const sp = new URLSearchParams();
    if (params?.project_id) sp.set("project_id", params.project_id);
    if (params?.category_id) sp.set("category_id", params.category_id);
    if (params?.status) sp.set("status", params.status);
    if (params?.pinned !== undefined) sp.set("pinned", String(params.pinned));
    if (params?.limit !== undefined) sp.set("limit", String(params.limit));
    if (params?.offset !== undefined) sp.set("offset", String(params.offset));
    const query = sp.toString();
    return this.request(`/api/notes${query ? `?${query}` : ""}`);
  }

  /** Create a new note with optional AI title generation. */
  async createNote(data: NoteCreateRequest): Promise<NoteResponse> {
    return this.request("/api/notes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Fetch a single note by ID. */
  async getNote(noteId: string): Promise<NoteResponse> {
    return this.request(`/api/notes/${encodeURIComponent(noteId)}`);
  }

  /** Update a note's title, body, category, project, status, or pinned state. */
  async updateNote(noteId: string, data: NoteUpdateRequest): Promise<NoteResponse> {
    return this.request(`/api/notes/${encodeURIComponent(noteId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** Soft-delete a note. */
  async deleteNote(noteId: string): Promise<void> {
    return this.request(`/api/notes/${encodeURIComponent(noteId)}`, {
      method: "DELETE",
    });
  }

  /** Admin: soft-delete any note regardless of owner. */
  async adminDeleteNote(noteId: string): Promise<void> {
    return this.request(`/api/admin/notes/${encodeURIComponent(noteId)}`, {
      method: "DELETE",
    });
  }

  /** Mark a note as completed. */
  async completeNote(noteId: string): Promise<NoteResponse> {
    return this.request(`/api/notes/${encodeURIComponent(noteId)}/complete`, {
      method: "POST",
    });
  }

  /** Archive a note. */
  async archiveNote(noteId: string): Promise<NoteResponse> {
    return this.request(`/api/notes/${encodeURIComponent(noteId)}/archive`, {
      method: "POST",
    });
  }

  /** @deprecated Use exportBugs() instead. */
  async exportAppBugs(): Promise<{ markdown: string; count: number }> {
    return this.request("/api/notes/export/app-bugs");
  }

  // ---- Issue/Bug Export ----

  /** Export open/in-progress bugs as markdown for Claude Code. */
  async exportBugs(projectId?: string): Promise<{ markdown: string; count: number }> {
    const params = new URLSearchParams();
    if (projectId) params.set("project_id", projectId);
    const qs = params.toString();
    return this.request(`/api/issues/export${qs ? `?${qs}` : ""}`);
  }

  // ---- Note Categories ----

  /** List all note categories for the current user. */
  async listNoteCategories(): Promise<NoteCategoryListResponse> {
    return this.request("/api/note-categories");
  }

  /** Create a new note category. */
  async createNoteCategory(data: NoteCategoryCreateRequest): Promise<NoteCategoryResponse> {
    return this.request("/api/note-categories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Update an existing note category. */
  async updateNoteCategory(
    categoryId: string,
    data: NoteCategoryUpdateRequest,
  ): Promise<NoteCategoryResponse> {
    return this.request(`/api/note-categories/${encodeURIComponent(categoryId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** Delete a note category (blocked for system categories). */
  async deleteNoteCategory(categoryId: string): Promise<void> {
    return this.request(`/api/note-categories/${encodeURIComponent(categoryId)}`, {
      method: "DELETE",
    });
  }

  // ---- Issues ----

  /** List issues with optional filters. */
  async listIssues(params?: {
    project_id?: string;
    is_app_issue?: boolean;
    status?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }): Promise<IssueListResponse> {
    const sp = new URLSearchParams();
    if (params?.project_id) sp.set("project_id", params.project_id);
    if (params?.is_app_issue !== undefined) sp.set("is_app_issue", String(params.is_app_issue));
    if (params?.status) sp.set("status", params.status);
    if (params?.severity) sp.set("severity", params.severity);
    if (params?.limit !== undefined) sp.set("limit", String(params.limit));
    if (params?.offset !== undefined) sp.set("offset", String(params.offset));
    const query = sp.toString();
    return this.request(`/api/issues${query ? `?${query}` : ""}`);
  }

  /** Create a new issue. */
  async createIssue(data: IssueCreateRequest): Promise<IssueResponse> {
    return this.request("/api/issues", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Get a single issue. */
  async getIssue(issueId: string): Promise<IssueResponse> {
    return this.request(`/api/issues/${encodeURIComponent(issueId)}`);
  }

  /** Update an issue. */
  async updateIssue(issueId: string, data: IssueUpdateRequest): Promise<IssueResponse> {
    return this.request(`/api/issues/${encodeURIComponent(issueId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /** Soft-delete an issue. */
  async deleteIssue(issueId: string): Promise<void> {
    return this.request(`/api/issues/${encodeURIComponent(issueId)}`, {
      method: "DELETE",
    });
  }

  /** Start a fix for an issue (creates git branch). */
  async startIssueFix(issueId: string): Promise<StartFixResponse> {
    return this.request(`/api/issues/${encodeURIComponent(issueId)}/start-fix`, {
      method: "POST",
    });
  }

  /** Check review status for an issue. */
  async getIssueReviewStatus(issueId: string): Promise<{
    issue_id: string;
    status: string;
    fix_pr_url: string | null;
    coderabbit_review_url: string | null;
    has_pr: boolean;
  }> {
    return this.request(`/api/issues/${encodeURIComponent(issueId)}/review-status`);
  }

  /** Scan project for open issues. */
  async scanProjectIssues(projectId: string): Promise<IssueListResponse> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/issues/scan`);
  }

  /** Promote a note to an issue. */
  async promoteNoteToIssue(noteId: string): Promise<IssueResponse> {
    return this.request(`/api/notes/${encodeURIComponent(noteId)}/promote-to-issue`, {
      method: "POST",
    });
  }

  // ---- Admin Notes ----

  /** Admin: list all notes across all users. */
  async adminListNotes(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<NoteListResponse> {
    const sp = new URLSearchParams();
    if (params?.status) sp.set("status", params.status);
    if (params?.limit !== undefined) sp.set("limit", String(params.limit));
    if (params?.offset !== undefined) sp.set("offset", String(params.offset));
    const query = sp.toString();
    return this.request(`/api/admin/notes${query ? `?${query}` : ""}`);
  }
}

// Singleton client instance
let clientInstance: WorkstationClient | null = null;

/**
 * Return the shared singleton {@link WorkstationClient} instance, creating it
 * on first call using the `NEXT_PUBLIC_API_URL` environment variable as the
 * base URL.
 *
 * Use this function in React components and hooks rather than constructing a
 * new client on every render.
 */
export function getClient(): WorkstationClient {
  if (!clientInstance) {
    clientInstance = new WorkstationClient();
  }
  return clientInstance;
}
